# Prueba schema.sql y tests.sql en un Postgres real embebido (pip install pgserver).
#   python3 dev-tests/runsql.py
import pgserver, subprocess, shutil, os, glob
HERE = os.path.dirname(os.path.abspath(__file__)); SQL = os.path.join(HERE, '..', 'sql')
shutil.rmtree('/tmp/pgdata_cq', ignore_errors=True)
srv = pgserver.get_server('/tmp/pgdata_cq', cleanup_mode='delete'); uri = srv.get_uri()
psql = glob.glob(os.path.dirname(pgserver.__file__)+'/pginstall/bin/psql')[0]
def run(f):
    r = subprocess.run([psql, uri, '-v', 'ON_ERROR_STOP=1', '-f', f], capture_output=True, text=True); return r.returncode, (r.stdout + r.stderr)
for f in [os.path.join(HERE,'stub.sql'), os.path.join(SQL,'schema.sql'), os.path.join(SQL,'schema.sql'), os.path.join(SQL,'tests.sql')]:
    rc, o = run(f); print(os.path.basename(f), 'rc=', rc)
    if rc or os.path.basename(f) == 'tests.sql': print(o[-900:])
    if rc: break
