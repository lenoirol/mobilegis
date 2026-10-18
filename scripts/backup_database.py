"""Create a portable custom-format PostgreSQL backup without exposing credentials."""
import argparse,getpass,json,os,subprocess,sys
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db

def backup(output=None):
    cfg=db.config()
    if not isinstance(cfg,dict):raise RuntimeError('Use a local JSON connection config.')
    path=Path(output).resolve() if output else ROOT.parent/'mobilegis_luu_tru_20261011/sau_nang_cap_pg3'/('mobilegis_pg3_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'.backup')
    if path.exists():raise RuntimeError('Backup destination already exists; choose a new filename.')
    binary=Path(r'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe')
    if not binary.exists():raise RuntimeError('Set the PostgreSQL 18 pg_dump installation path in this script.')
    path.parent.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'PGPASSWORD':getpass.getpass('PostgreSQL admin password: ')}
    subprocess.run([str(binary),'-h',cfg['host'],'-p',str(cfg['port']),'-U','postgres','-d',cfg['dbname'],
                    '-Fc','--no-owner','--no-acl','--file',str(path)],env=env,check=True)
    result=subprocess.run([str(binary.with_name('pg_restore.exe')),'--list',str(path)],capture_output=True,check=True)
    toc=result.stdout.decode('utf8')
    if not all('TABLE DATA mobilegis '+t+' ' in toc for t in ('analysis_runs','lst_results','pixel_statistics')):
        raise RuntimeError('PG3 backup table inventory incomplete.')
    print('PG3 backup created and table inventory checked:',path,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output');a=p.parse_args();backup(a.output)
