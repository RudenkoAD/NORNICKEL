"""Download files from Yandex Disk public folder (with retries, skip existing)."""
import os
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

PUB_KEY = 'https://disk.yandex.ru/d/npigiuw4Rbe9Pg'
BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources'
DOWNLOAD_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources/download'

def api_request(url, retries=3):
    for attempt in range(retries):
        try:
            r = urllib.request.urlopen(url, timeout=30)
            return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))

def list_dir(path=''):
    safe_path = urllib.parse.quote(path, safe='/')
    url = f'{BASE}?public_key={PUB_KEY}&path={safe_path}&limit=200'
    data = api_request(url)
    return data.get('_embedded', {}).get('items', [])

def download_file(file_item, dest_dir):
    filename = file_item['name']
    file_path = file_item['path']
    dest = dest_dir / filename
    if dest.exists() and dest.stat().st_size > 0:
        print(f'  SKIP (exists): {filename}')
        return
    safe_path = urllib.parse.quote(file_path, safe='/')
    url = f'{DOWNLOAD_BASE}?public_key={PUB_KEY}&path={safe_path}'
    data = api_request(url)
    download_url = data.get('href')
    if not download_url:
        print(f'  ERROR: No download URL for {filename}')
        return
    print(f'  Downloading: {filename} ...')
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(download_url, str(dest))
            break
        except Exception as e:
            if attempt == 2:
                print(f'    FAILED after 3 attempts: {e}')
                return
            print(f'    Retry {attempt+1}: {e}')
            time.sleep(5)
    print(f'    -> OK ({os.path.getsize(dest)} bytes)')

def walk_and_download(remote_path, local_base):
    items = list_dir(remote_path)
    for item in items:
        if item['type'] == 'dir':
            sub_local = local_base / item['name']
            sub_local.mkdir(parents=True, exist_ok=True)
            print(f'Dir: {item["name"]}/')
            walk_and_download(item['path'], sub_local)
        elif item['type'] == 'file':
            download_file(item, local_base)

if __name__ == '__main__':
    corpus = Path(__file__).parent / 'corpus'
    corpus.mkdir(parents=True, exist_ok=True)

    root_items = list_dir('')
    print(f'Root: {len(root_items)} items')
    for i in root_items:
        print(f'  [{i["type"]}] {i["name"]}')

    info_folder = root_items[0]
    print(f'\nUsing: {info_folder["name"]}')
    print(f'Target: {corpus}')
    print('=' * 50)

    walk_and_download(info_folder['path'], corpus)
    print('\nDone!')
