import hashlib, json, os, pathlib, subprocess, sys, time
root = pathlib.Path.cwd()
name, *command = sys.argv[1:]
environment = root / '.cache/remote-t09/environment'
env = {'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8', 'HOME': str(environment/'home'), 'USERPROFILE': str(environment/'home'), 'XDG_CONFIG_HOME': str(environment/'config'), 'XDG_CACHE_HOME': str(environment/'cache'), 'XDG_DATA_HOME': str(environment/'data'), 'TMPDIR': str(environment/'tmp'), 'TMP': str(environment/'tmp'), 'TEMP': str(environment/'tmp'), 'APPDATA': str(environment/'config'), 'LOCALAPPDATA': str(environment/'data'), 'TSX_DISABLE_CACHE': '1', 'ASEN_NO_SKILL_REGISTRY': '1'}
watched = ['src/cli.ts', 'src/runtime/launcher.ts', 'src/runtime/managed-acquisition-copy.ts', 'tests/managed-acquisition-copy.test.ts', 'tests/managed-update-stage-cli.test.ts', 'package.json', 'package-lock.json']
def hashes():
    return {p: hashlib.sha256((root/p).read_bytes()).hexdigest() for p in watched if (root/p).exists()}
before, started = hashes(), time.monotonic()
result = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
folder = root/'.cache/remote-t09'
(folder/(name+'.stdout')).write_bytes(result.stdout)
(folder/(name+'.stderr')).write_bytes(result.stderr)
report = {'command':command, 'exit':result.returncode, 'elapsedSeconds':round(time.monotonic()-started,3), 'before':before, 'after':hashes()}
(folder/(name+'.json')).write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
print(result.stdout.decode(errors='replace')[-7000:])
print(result.stderr.decode(errors='replace')[-2000:])
sys.exit(result.returncode)
