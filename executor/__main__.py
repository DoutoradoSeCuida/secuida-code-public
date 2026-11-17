"""SeCuida Code local bridge; no shared AI executor or provider credentials."""
from __future__ import annotations
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import secrets
import threading
from urllib.parse import urlparse
from runtime import Runner


def handler(runner, token, origins):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'SeCuidaCode/0.1.0'

        def log_message(self, *args):
            pass  # Do not log authorization, code, inputs or requests.

        def origin(self):
            return self.headers.get('Origin', '')

        def allowed(self):
            host = self.headers.get('Host', '')
            port = self.server.server_port
            return host in [f'127.0.0.1:{port}', f'localhost:{port}'] and self.origin() in origins

        def reply(self, status, value):
            body = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            if self.origin() in origins:
                self.send_header('Access-Control-Allow-Origin', self.origin())
                self.send_header('Vary', 'Origin')
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_OPTIONS(self):
            if not self.allowed():
                return self.reply(403, {'message': 'Origem não autorizada.'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.origin())
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Max-Age', '300')
            self.send_header('Vary', 'Origin')
            self.end_headers()

        def authorized(self):
            if not self.allowed() or not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                self.reply(403, {'message': 'Confira a chave de conexão e a origem autorizada.'})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path != '/health':
                return self.reply(404, {'message': 'Ação indisponível.'})
            languages, message = runner.capabilities()
            self.reply(200, {'product': 'secuida-code', 'protocol': 1, 'version': '0.1.0', 'languages': languages, 'message': message})

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != '/run':
                return self.reply(404, {'message': 'Ação indisponível.'})
            try:
                size = int(self.headers.get('Content-Length', '-1'))
                if size < 0 or size > 150000:
                    return self.reply(413, {'message': 'Pedido muito grande.'})
                self.connection.settimeout(5)
                value = json.loads(self.rfile.read(size))
                if not isinstance(value, dict) or any(not isinstance(value.get(k), str) for k in ['language', 'code', 'input']):
                    raise ValueError('Informe linguagem, código e entrada.')
                self.reply(200, runner.execute(value['language'], value['code'], value['input']))
            except (ValueError, TimeoutError) as error:
                self.reply(400, {'message': str(error)})
            except RuntimeError as error:
                self.reply(503, {'message': str(error)})
            except Exception:
                self.reply(503, {'message': 'O ambiente não concluiu a execução. Confira as ferramentas portáteis e tente novamente.'})

    return Handler


def make_server(runner, origins):
    token = secrets.token_urlsafe(32)
    # Bind once to port 0: the OS allocates a free port atomically, without
    # probing or interrupting another application listening on the old port.
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler(runner, token, origins))
    server.daemon_threads = True
    return server, f'sccode1:{server.server_port}:{token}'


def main():
    parser = argparse.ArgumentParser(description='Executor local SeCuida Code Público')
    parser.add_argument('--origin', action='append', required=True, help='Origem HTTPS exata autorizada. Pode repetir.')
    parser.add_argument('--no-ui', action='store_true')
    args = parser.parse_args()
    origins = set(args.origin)
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme not in ['https', 'http'] or parsed.path or parsed.query or parsed.fragment or not parsed.hostname or parsed.username or parsed.password or (parsed.scheme == 'http' and parsed.hostname not in ['localhost', '127.0.0.1']):
            parser.error('Use uma origem HTTPS exata, sem caminho. HTTP somente para localhost.')
    print('ATENÇÃO: o código será executado no seu computador com suas permissões, sem isolamento.')
    print('Use apenas código de confiança. Ele pode acessar arquivos e a rede.')
    if input('Digite SIM para iniciar: ').strip().upper() != 'SIM':
        print('Executor não iniciado.'); return
    runner = Runner()
    server, pairing = make_server(runner, origins)
    print('SeCuida Code Público · executor local\nOrigens: ' + ', '.join(origins))
    print('Código de conexão desta execução: ' + pairing)
    print('Cole o código completo em Conta → Executor local. Ctrl+C encerra o programa.')
    if not args.no_ui:
        try:
            import tkinter as tk
            root = tk.Tk()
            root.title('SeCuida Code Público · executor')
            root.geometry('640x300')
            tk.Label(root, text='Executor local SeCuida Code Público', font=('Segoe UI', 17)).pack(pady=15)
            tk.Label(root, text='Cole este código completo em Conta → Executor local na app.').pack()
            entry = tk.Entry(root, width=75)
            entry.insert(0, pairing)
            entry.configure(state='readonly')
            entry.pack(pady=12)
            def copy():
                root.clipboard_clear(); root.clipboard_append(pairing)
            tk.Button(root, text='Copiar código de conexão', command=copy).pack()
            tk.Label(root, text='Execução local sem isolamento; use apenas código confiável.\nVeja README.md para preparar as linguagens.\nO código muda sempre que você abre o executor.').pack(pady=14)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def close():
                server.shutdown(); root.destroy()
            root.protocol('WM_DELETE_WINDOW', close)
            root.mainloop()
            server.server_close()
            return
        except (ImportError, RuntimeError):
            print('Janela indisponível. Use a chave mostrada acima.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
