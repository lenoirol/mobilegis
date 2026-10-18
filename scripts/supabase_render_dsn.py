"""Build the connection string Render needs (Supabase *Session pooler*, IPv4) and copy it to the clipboard.

The app-role password is read from config/supabase.local.json and is never printed: only a masked preview is shown.
    .venv/bin/python scripts/supabase_render_dsn.py --host aws-0-ap-southeast-1.pooler.supabase.com
Then paste (Cmd+V) into the MOBILEGIS_DATABASE_URL box on Render.
"""
import argparse, json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
from psycopg.conninfo import conninfo_to_dict, make_conninfo


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--host', required=True, help='host của Session pooler, ví dụ aws-0-ap-southeast-1.pooler.supabase.com')
    parser.add_argument('--ref', default='dramddqxgrcspfcpqnhe', help='mã project Supabase')
    args = parser.parse_args()
    if not args.host.endswith('pooler.supabase.com'):
        sys.exit('Host phải là host Session pooler (kết thúc bằng pooler.supabase.com), không phải db.<mã>.supabase.co.')
    cfg = json.loads((ROOT / 'config/supabase.local.json').read_text(encoding='utf8'))
    info = conninfo_to_dict(cfg['dsn'])
    role = info['user'].split('.')[0]
    dsn = f"postgresql://{role}.{args.ref}:{info['password']}@{args.host}:5432/postgres"
    subprocess.run(['pbcopy'], input=dsn.encode(), check=True)
    masked = dsn.replace(info['password'], '*' * 8)
    print('Đã sao chép vào clipboard (Cmd+V để dán). Xem trước:\n ', masked)


if __name__ == '__main__':
    main()
