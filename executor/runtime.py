"""Executor local. Fonte de verdade: ../spec/code.md.

Código do aluno roda com as permissões do usuário, sem isolamento de segurança.
Caminhos controlados têm até 30 caracteres por componente; a exceção de tamanho
para sc_vector_db/ e descendentes é preservada e não é usada pelo executor.
"""
from __future__ import annotations
import os
from pathlib import Path
import shutil
import signal
import subprocess
import shutil
import sys
import tempfile
import threading
import time

MAX_OUTPUT = 64000
LANGUAGES = ('python', 'javascript', 'c', 'cpp', 'java')


class Runner:
    def __init__(self):
        def find(*names):
            for name in names:
                executable = shutil.which(name)
                if executable:
                    return Path(executable).absolute()
            return None

        self.tools = {
            'python': Path(sys.executable),
            'javascript': find('node'),
            'c': find('gcc', 'clang', 'tcc'),
            'cpp': find('g++', 'clang++'),
            'java': find('java'),
            'javac': find('javac'),
        }
        self.lock = threading.Lock()

    def capabilities(self):
        available = []
        for key in LANGUAGES:
            tool = self.tools[key]
            if tool and (key != 'java' or self.tools['javac']):
                is_tcc = key == 'c' and tool.stem.lower() == 'tcc'
                version = 'TinyCC · C limitado' if is_tcc else 'local · sem isolamento'
                available.append({'language': key, 'version': version})
        return available, 'Linguagens detectadas nas ferramentas instaladas neste computador.'

    def _command(self, language, work):
        available = {item['language'] for item in self.capabilities()[0]}
        if language not in available:
            raise ValueError('Esta linguagem não está preparada. Consulte as instruções do executor.')
        if language == 'c':
            return ([str(self.tools['c']), 'main.c', '-o', 'main.exe'] if self.tools['c'].stem.lower() == 'tcc' else [str(self.tools['c']), '-O2', '-std=c17', 'main.c', '-o', 'main.exe']), [str(work / 'main.exe')]
        if language == 'cpp':
            return [str(self.tools['cpp']), '-O2', '-std=c++17', 'main.cpp', '-o', 'main.exe'], [str(work / 'main.exe')]
        if language == 'java':
            return [str(self.tools['javac']), '-encoding', 'UTF-8', 'Main.java'], [str(self.tools['java']), '-cp', str(work), 'Main']
        if language == 'python':
            return None, [str(self.tools['python']), '-I', '-B', str(work / 'main.py')]
        wrapper = 'const fs=require("fs");const lines=fs.readFileSync(0,"utf8").split(/\\r?\\n/);let i=0;globalThis.readline=()=>lines[i++];globalThis.print=(...v)=>console.log(...v);require(process.argv[1]);'
        return None, [str(self.tools['javascript']), '-e', wrapper, str(work / 'main.js')]

    def _run_process(self, command, work, input_text, tool):
        # No console window is created for compilation or child execution.
        kwargs = {'cwd': str(work), 'stdin': subprocess.PIPE, 'stdout': subprocess.PIPE,
                  'stderr': subprocess.PIPE, 'shell': False}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs['start_new_session'] = True
        env = os.environ.copy()
        env['PATH'] = str(tool.parent) + os.pathsep + env.get('PATH', '')
        kwargs['env'] = env
        proc = subprocess.Popen(command, **kwargs)
        buffers = [bytearray(), bytearray()]
        overflow = threading.Event()
        def drain(stream, buffer):
            while True:
                block = stream.read(4096)
                if not block: break
                remaining = MAX_OUTPUT - len(buffer)
                buffer.extend(block[:max(remaining, 0)])
                if len(block) > remaining: overflow.set()
            stream.close()
        threads = [threading.Thread(target=drain, args=(stream, buf), daemon=True)
                   for stream, buf in zip((proc.stdout, proc.stderr), buffers)]
        for thread in threads: thread.start()
        def feed():
            try: proc.stdin.write(input_text.encode('utf-8')); proc.stdin.close()
            except (BrokenPipeError, OSError): pass
        writer = threading.Thread(target=feed, daemon=True); writer.start()
        deadline = time.monotonic() + 12
        reason = ''
        while proc.poll() is None:
            if overflow.is_set() or time.monotonic() >= deadline:
                reason = 'Limite de saída excedido.' if overflow.is_set() else 'Tempo limite excedido.'
                if os.name == 'nt':
                    system = os.environ.get('SystemRoot', r'C:\Windows')
                    try:
                        subprocess.run([str(Path(system) / 'System32' / 'taskkill.exe'), '/PID', str(proc.pid), '/T', '/F'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       creationflags=subprocess.CREATE_NO_WINDOW, timeout=5, check=False)
                    except (OSError, subprocess.SubprocessError):
                        pass
                else:
                    try: os.killpg(proc.pid, signal.SIGKILL)
                    except (ProcessLookupError, PermissionError): pass
                if proc.poll() is None: proc.kill()
                break
            time.sleep(.025)
        proc.wait(timeout=5)
        for thread in threads: thread.join(timeout=2)
        writer.join(timeout=2)
        if overflow.is_set() and not reason: reason = 'Limite de saída excedido.'
        return {'output': buffers[0].decode('utf-8', errors='replace'),
                'error': reason or (buffers[1].decode('utf-8', errors='replace')[:4000] if proc.returncode else ''),
                'exit_code': 124 if reason else proc.returncode}

    def execute(self, language, code, input_text):
        if language not in LANGUAGES: raise ValueError('Linguagem não suportada.')
        if len(code.encode()) > 60000 or len(input_text.encode()) > 10000: raise ValueError('Código ou entrada excedem o limite.')
        if not self.lock.acquire(blocking=False): raise ValueError('Já existe uma execução em andamento.')
        try:
            with tempfile.TemporaryDirectory(prefix='scc-') as directory:
                work = Path(directory)
                filenames = {'python':'main.py', 'javascript':'main.js', 'c':'main.c', 'cpp':'main.cpp', 'java':'Main.java'}
                (work / filenames[language]).write_text(code, encoding='utf-8')
                compile_cmd, run_cmd = self._command(language, work)
                if compile_cmd:
                    compiled = self._run_process(compile_cmd, work, '', Path(compile_cmd[0]))
                    if compiled['exit_code']:
                        return {**compiled, 'engine':'local-native-' + language}
                result = self._run_process(run_cmd, work, input_text, Path(run_cmd[0]))
                return {**result, 'engine':'local-native-' + language}
        except OSError as error:
            raise RuntimeError('Não foi possível iniciar ou limpar a execução local: ' + str(error)) from error
        finally:
            self.lock.release()
