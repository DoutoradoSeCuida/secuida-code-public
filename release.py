#!/usr/bin/env python3
"""Compile and package the standalone WordPress edition and its GitHub sources."""

import argparse
import io
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipapp
import zipfile

PLUGIN = Path(__file__).resolve().parent
SLUG = 'sc-code-public'
SOURCE_DIRS = ('app', 'assets', 'examples', 'public', 'spec', 'src', 'tests')
SOURCE_FILES = (
    '.gitignore', '.nvmrc', 'app.config.js', 'babel.config.js',
    'package.json', 'package-lock.json', 'tsconfig.json',
)
PLUGIN_FILES = ('sc-code-public.php', 'router.js', 'README.md', 'SECURITY.md')
RUNNER_FILES = ('__main__.py', 'runtime.py', 'README.md')


def location():
    copied = PLUGIN / 'web-src'
    if copied.is_dir():
        return PLUGIN, copied
    root = PLUGIN.parents[1]
    return root, root / 'mobile_apps' / 'secuida-code-public'


def ensure_folder(parent, name):
    if len(name) > 30 or Path(name).name != name or name in ('.', '..'):
        raise ValueError(f'Invalid directory name: {name}')
    siblings = [path for path in parent.iterdir() if path.name.casefold() == name.casefold()]
    if siblings and (len(siblings) != 1 or siblings[0].name != name or
                     siblings[0].is_symlink() or not siblings[0].is_dir()):
        raise ValueError(f'Conflicting or unsafe directory: {parent / name}')
    target = parent / name
    target.mkdir(exist_ok=True)
    return target


def entries(root, folders, names):
    for name in names:
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Missing or unsafe source file: {path}')
        yield path
    for folder in folders:
        path = root / folder
        if path.is_symlink() or not path.is_dir():
            raise ValueError(f'Missing or unsafe source folder: {path}')
        for directory, dirs, files in os.walk(path):
            for dirname in dirs:
                candidate = Path(directory) / dirname
                if candidate.is_symlink():
                    raise ValueError(f'Symlink in source: {candidate}')
            dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in
                            ('__pycache__', 'credentials', 'node_modules', 'dist'))
            for name in sorted(files):
                item = Path(directory) / name
                if name.startswith('.') or item.suffix in ('.pyc', '.pyo'):
                    continue
                if name.lower() in ('credentials.json', 'wp-config.php', 'id_rsa', 'id_ed25519') or item.suffix.lower() in (
                        '.enc', '.log', '.sql', '.p12', '.pem', '.key', '.jks', '.keystore', '.apk', '.aab', '.zip'):
                    raise ValueError(f'Sensitive file or generated package in source: {item}')
                yield item


def copy_client(client, work):
    for path in entries(client, SOURCE_DIRS, SOURCE_FILES):
        rel = path.relative_to(client)
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Unsafe source path: {rel}')
        target = work
        for part in rel.parts[:-1]:
            target = ensure_folder(target, part)
        target = target / rel.name
        if len(rel.name) > 30 or any(p.name.casefold() == rel.name.casefold() for p in target.parent.iterdir()):
            raise ValueError(f'Unsafe source file: {rel}')
        shutil.copyfile(path, target)


def command(args, path, env):
    subprocess.run(args, cwd=path, env=env, check=True)


def prepare_metro(work):
    # Metro 0.83.3 accepts image-size v1 paths. The patched v2 reads bytes.
    module = work / 'node_modules/metro/src/Assets.js'
    text = module.read_text()
    original = '(0, _imageSize.default)(isImageInput)'
    if text.count(original) != 1:
        raise RuntimeError('Review the Metro image-size compatibility patch.')
    updated = '(0, _imageSize.default)(typeof isImageInput === "string" ? await _fs.default.promises.readFile(isImageInput) : isImageInput)'
    module.write_text(text.replace(original, updated))


def npm_licenses(modules):
    records = set()
    for license_path in modules.rglob('*'):
        if (license_path.is_file() and not license_path.is_symlink() and
                license_path.name.upper().split('.')[0] in ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE') and
                license_path.stat().st_size <= 200_000):
            rel = license_path.relative_to(modules).as_posix()
            records.add((rel, license_path.read_text(encoding='utf-8', errors='replace')))
    return '\n\n'.join(f'===== {name} =====\n{text.strip()}' for name, text in sorted(records)) + '\n'


def package_runner():
    script = io.BytesIO()
    zipapp.create_archive(PLUGIN / 'executor', script,
                          filter=lambda path: path.name in RUNNER_FILES[:2])
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('executor.pyz', script.getvalue())
        archive.write(PLUGIN / 'executor' / 'README.md', 'README.md')
    return out.getvalue()


def validate_zip(path, must_have):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if set(must_have) - set(names) or len(names) != len({name.casefold() for name in names}):
            raise RuntimeError(f'Unexpected files in {path.name}')
        if archive.testzip():
            raise RuntimeError(f'Corrupt ZIP: {path.name}')
        for name in names:
            entry = Path(name)
            if entry.is_absolute() or '..' in entry.parts or not name.startswith(SLUG + '/'):
                raise RuntimeError(f'Invalid ZIP entry: {name}')


def pack(work, output):
    built = work / 'dist'
    html = (built / 'index.html').read_text()
    html = html.replace('lang="en"', 'lang="pt-BR"')
    html = re.sub(r'((?:src|href)=["\'])/(_expo/|favicon\.ico)', r'\1./\2', html)
    if '<head>' not in html or not re.search(r'src="\./_expo/[^"]+\.js"', html):
        raise RuntimeError('The Expo HTML does not link to the local bundle.')
    bundle = built / re.search(r'src="\./(_expo/[^"]+\.js)"', html)[1]
    script = bundle.read_text().replace('"/assets/', '"./assets/')
    if 'SC_CODE_PUBLIC_ROUTER' not in script:
        raise RuntimeError('The Expo Router integration was not compiled.')
    digest = hashlib.sha256(script.encode()).hexdigest()[:16]
    entry = bundle.with_name(f'entry-{digest}.js')
    entry.write_text(script)
    bundle.unlink()
    (built / 'index.html').write_text(html.replace(bundle.name, entry.name))
    licenses = npm_licenses(work / 'node_modules')
    if not licenses.strip():
        raise RuntimeError('Missing dependency licenses.')

    install = work / (SLUG + '.zip')
    source = work / (SLUG + '-src.zip')
    with zipfile.ZipFile(install, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in entries(PLUGIN, ('includes',), PLUGIN_FILES):
            archive.write(path, f'{SLUG}/{path.relative_to(PLUGIN)}')
        for path in sorted(built.rglob('*')):
            if path.is_file() and not path.is_symlink() and path.suffix != '.map' and not path.name.startswith('.'):
                archive.write(path, f'{SLUG}/web/{path.relative_to(built)}')
        archive.writestr(f'{SLUG}/web/downloads/executor.zip', package_runner())
        archive.writestr(f'{SLUG}/THIRD-PARTY.txt', licenses)

    with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in entries(PLUGIN, ('includes', 'executor'), (*PLUGIN_FILES, '.gitignore', 'release.py')):
            archive.write(path, f'{SLUG}/{path.relative_to(PLUGIN)}')
        for path in entries(work, SOURCE_DIRS, SOURCE_FILES):
            archive.write(path, f'{SLUG}/web-src/{path.relative_to(work)}')

    validate_zip(install, [f'{SLUG}/sc-code-public.php', f'{SLUG}/web/index.html',
                           f'{SLUG}/web/downloads/executor.zip', f'{SLUG}/THIRD-PARTY.txt'])
    validate_zip(source, [f'{SLUG}/release.py', f'{SLUG}/web-src/package-lock.json',
                          f'{SLUG}/web-src/spec/code-public.md'])
    for path in (install, source):
        dest = output / path.name
        path.replace(dest)
        print(dest, flush=True)


def main():
    workspace, client = location()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, default=workspace / 'zips')
    args = parser.parse_args()
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    task = ensure_folder(ensure_folder(workspace, '_temporarios'), 'pack-code-public')
    with tempfile.TemporaryDirectory(prefix='run-', dir=task) as temp:
        work = Path(temp)
        copy_client(client, work)
        local_tmp = ensure_folder(work, 'tmp')
        npm_cache = ensure_folder(work, 'npm-cache')
        env = {**os.environ, 'TMPDIR': str(local_tmp), 'TEMP': str(local_tmp), 'TMP': str(local_tmp),
               'npm_config_cache': str(npm_cache), 'EXPO_NO_DOTENV': '1', 'EXPO_NO_TELEMETRY': '1'}
        env.pop('EXPO_BASE_URL', None)
        command(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], work, env)
        command(['npm', 'run', 'typecheck'], work, env)
        command(['npm', 'test'], work, env)
        for test in sorted((client / 'tests').glob('*.php')):
            if test.name != 'wp-stubs.php':
                command(['php', str(test)], client, env)
        prepare_metro(work)
        command(['npm', 'run', 'export:web'], work, env)
        pack(work, output)


if __name__ == '__main__':
    main()
