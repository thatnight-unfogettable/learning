import json
import mimetypes
import os
import re
import socket
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import base64
import uuid
import tempfile
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"


def _get_data_dir():
    """允许通过 DATA_DIR 指定数据目录；若项目目录不可写则使用系统临时目录。"""
    env = os.environ.get("DATA_DIR", "").strip()
    if env:
        return Path(env)
    if os.access(BASE_DIR, os.W_OK):
        return BASE_DIR
    return Path(tempfile.gettempdir()) / "shuati"


DATA_DIR = _get_data_dir()
DATA_FILE = DATA_DIR / "data.json"
IMAGES_DIR = DATA_DIR / "images"


def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _migrate_data_file():
    """只读环境启动时，把项目目录里的 data.json 复制到可写目录。"""
    if DATA_FILE.exists():
        return
    base_file = BASE_DIR / "data.json"
    if not base_file.exists():
        return
    try:
        _ensure_data_dir()
        DATA_FILE.write_text(base_file.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError:
        pass


_migrate_data_file()
LOCK = threading.Lock()
MAX_BODY = 50 * 1024 * 1024

MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


def load_records():
    if not DATA_FILE.exists():
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_records(records):
    _ensure_data_dir()
    tmp_file = DATA_FILE.with_name(DATA_FILE.name + ".tmp")
    with open(tmp_file, "w", encoding="utf-8") as file:
        json.dump(records, file, ensure_ascii=False, indent=2)
    tmp_file.replace(DATA_FILE)


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def normalize(data):
    tags = data.get("tags") or []
    notes = data.get("notes") or []
    better = data.get("betterSolutions") or []
    return {
        "platform": str(data.get("platform") or "洛谷").strip(),
        "pid": str(data.get("pid") or "").strip(),
        "title": str(data.get("title") or "").strip(),
        "difficulty": str(data.get("difficulty") or "").strip(),
        "tags": [str(tag).strip() for tag in tags if str(tag).strip()],
        "date": str(data.get("date") or "").strip(),
        "status": str(data.get("status") or "已通过").strip(),
        "description": str(data.get("description") or ""),
        "codeText": str(data.get("codeText") or ""),
        "codePath": str(data.get("codePath") or "").strip(),
        "notes": [
            {
                "problem": str(note.get("problem") or ""),
                "solution": str(note.get("solution") or ""),
            }
            for note in notes
            if isinstance(note, dict)
            and (str(note.get("problem") or "").strip() or str(note.get("solution") or "").strip())
        ],
        "betterSolutions": [
            {
                "idea": str(item.get("idea") or ""),
                "code": str(item.get("code") or ""),
            }
            for item in better
            if isinstance(item, dict)
            and (str(item.get("idea") or "").strip() or str(item.get("code") or "").strip())
        ],
    }


LUOGU_DIFFICULTY_NAMES = {
    0: "暂无评定",
    1: "入门",
    2: "普及−",
    3: "普及/提高−",
    4: "普及+/提高",
    5: "提高+/省选−",
    6: "省选/NOI−",
    7: "NOI/NOI+/CTSC",
}


def fetch_luogu_problem(pid):
    import http.cookiejar

    url = f"https://www.luogu.com.cn/problem/{pid}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
        "x-luogu-type": "content-only",
    }
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    raw = ""
    content_type = ""
    for attempt in range(2):
        request = urllib.request.Request(url, headers=headers)
        try:
            with opener.open(request, timeout=10) as response:
                raw = response.read().decode("utf-8", errors="replace")
                content_type = response.headers.get("Content-Type", "")
            break
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307) and attempt == 0:
                continue
            return None, f"洛谷返回了错误状态码 {exc.code}（题目可能不存在或未公开）"
        except (urllib.error.URLError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            return None, f"无法连接洛谷：{reason}"
    candidates = []
    if "json" in content_type.lower() or raw.lstrip().startswith("{"):
        candidates.append(raw)
    candidates.extend(re.findall(r"<script(?!\s*src)[^>]*>(.*?)</script>", raw, re.S))
    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate.startswith("{"):
            continue
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        problem = (data.get("data") or {}).get("problem") or (data.get("currentData") or {}).get("problem") or {}
        if str(problem.get("pid") or "").upper() != pid.upper():
            continue
        info = problem_info(problem, pid)
        if info:
            return info, None
    match = re.search(r"<title>([^<]*)</title>", raw)
    if match:
        text = re.sub(r"\s*[-–]\s*洛谷.*$", "", match.group(1)).strip()
        text = re.sub(rf"^{re.escape(pid)}\s*", "", text).strip()
        text = re.sub(r"^(\[[^\]]*\]\s*)+", "", text).strip()
        if text:
            return {"platform": "洛谷", "pid": pid, "title": text, "difficulty": "", "description": ""}, None
    return None, "无法从洛谷页面解析出题目信息"


def problem_info(problem, pid):
    title = problem.get("title") or ""
    if not title:
        return None
    diff = problem.get("difficulty")
    difficulty = LUOGU_DIFFICULTY_NAMES.get(diff, str(diff) if diff is not None else "")
    description = ""
    background = problem.get("background") or ""
    desc = problem.get("description") or ""
    input_fmt = problem.get("inputFormat") or problem.get("input") or ""
    output_fmt = problem.get("outputFormat") or problem.get("output") or ""
    hint = problem.get("hint") or ""
    parts = []
    if background:
        parts.append(background)
    if desc:
        parts.append(desc)
    if input_fmt:
        parts.append(f"【输入格式】\n{input_fmt}")
    if output_fmt:
        parts.append(f"【输出格式】\n{output_fmt}")
    if hint:
        parts.append(f"【提示】\n{hint}")
    description = "\n\n".join(parts)
    return {"platform": "洛谷", "pid": pid, "title": title, "difficulty": difficulty, "description": description}




def _ensure_images_dir():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def _parse_image_data(data):
    """支持 data:image/xxx;base64,... 或纯 base64 字符串，默认 image/png。"""
    text = str(data or "").strip()
    match = re.match(r"^data:(?P<mime>[\w/+-]+);base64,(?P<b64>.*)$", text, re.S)
    if match:
        mime = match.group("mime")
        b64 = match.group("b64")
    else:
        mime = "image/png"
        b64 = text
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        return None
    return mime, raw


def _save_image(mime, raw):
    _ensure_images_dir()
    ext = mimetypes.guess_extension(mime) or ".bin"
    if ext == ".jpe":
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = IMAGES_DIR / filename
    file_path.write_bytes(raw)
    return f"/images/{filename}"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except Exception as exc:
            try:
                body = json.dumps({"error": "internal_error", "message": str(exc)}, ensure_ascii=False).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                pass

    def _send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    def _serve_static(self, url_path):
        rel_path = url_path.lstrip("/") or "index.html"
        file_path = (WEB_DIR / rel_path).resolve()
        if not file_path.is_relative_to(WEB_DIR.resolve()) or not file_path.is_file():
            self._send_json({"error": "not found"}, 404)
            return
        mime = MIME_OVERRIDES.get(file_path.suffix.lower()) or (
            mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        )
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/records":
            with LOCK:
                self._send_json(load_records())
        elif path == "/api/luogu":
            params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            pid = (params.get("pid") or [""])[0].strip()
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{1,15}", pid):
                self._send_json({"error": "bad_pid", "message": "题号格式不对，示例：P1085 或洛谷题目链接"}, 400)
                return
            info, error = fetch_luogu_problem(pid)
            if error:
                self._send_json({"error": "luogu_failed", "message": error}, 502)
                return
            self._send_json(info)
        elif path.startswith("/images/"):
            rel_path = path[len("/images/"):].lstrip("/")
            file_path = (IMAGES_DIR / rel_path).resolve()
            if "/" in rel_path or "\\" in rel_path or not file_path.is_relative_to(IMAGES_DIR.resolve()) or not file_path.is_file():
                self._send_json({"error": "not found"}, 404)
                return
            mime = MIME_OVERRIDES.get(file_path.suffix.lower()) or (
                mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            )
            body = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        elif path.startswith("/api/"):
            self._send_json({"error": "not found"}, 404)
        else:
            self._serve_static(path)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/images":
            data = self._read_json()
            if not data or not data.get("data"):
                self._send_json({"error": "bad_request", "message": "缺少图片数据"}, 400)
                return
            parsed = _parse_image_data(data["data"])
            if not parsed:
                self._send_json({"error": "invalid_image", "message": "无法解析图片数据"}, 400)
                return
            url = _save_image(*parsed)
            self._send_json({"url": url})
            return
        if path != "/api/records":
            self._send_json({"error": "not found"}, 404)
            return
        data = self._read_json()
        if data is None:
            self._send_json({"error": "bad request"}, 400)
            return
        with LOCK:
            records = load_records()
            record = normalize(data)
            record["id"] = max((r.get("id", 0) for r in records if isinstance(r, dict)), default=0) + 1
            record["createdAt"] = now_str()
            record["updatedAt"] = record["createdAt"]
            records.append(record)
            save_records(records)
        self._send_json(record, 201)

    def do_PUT(self):
        path = self.path.split("?", 1)[0]
        prefix = "/api/records/"
        if not path.startswith(prefix) or not path[len(prefix):].isdigit():
            self._send_json({"error": "not found"}, 404)
            return
        record_id = int(path[len(prefix):])
        data = self._read_json()
        if data is None:
            self._send_json({"error": "bad request"}, 400)
            return
        with LOCK:
            records = load_records()
            index = next(
                (i for i, r in enumerate(records) if isinstance(r, dict) and r.get("id") == record_id), None
            )
            if index is None:
                self._send_json({"error": "not found"}, 404)
                return
            updated = normalize(data)
            updated["id"] = record_id
            updated["createdAt"] = records[index].get("createdAt", now_str())
            updated["updatedAt"] = now_str()
            records[index] = updated
            save_records(records)
        self._send_json(updated)

    def do_DELETE(self):
        path = self.path.split("?", 1)[0]
        prefix = "/api/records/"
        if not path.startswith(prefix) or not path[len(prefix):].isdigit():
            self._send_json({"error": "not found"}, 404)
            return
        record_id = int(path[len(prefix):])
        with LOCK:
            records = load_records()
            remaining = [r for r in records if not (isinstance(r, dict) and r.get("id") == record_id)]
            if len(remaining) == len(records):
                self._send_json({"error": "not found"}, 404)
                return
            save_records(remaining)
        self._send_json({"ok": True})


def pick_port(host):
    for port in range(8765, 8776):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
                return port
            except OSError:
                continue
    return None


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    host = os.environ.get("HOST", "127.0.0.1").strip()
    port_env = os.environ.get("PORT", "").strip()
    if port_env.isdigit():
        port = int(port_env)
    else:
        port = pick_port(host)
        if port is None:
            print("No free port found in 8765-8775.")
            return
    server = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}"
    print(f"Server running at {url}  (Ctrl+C to stop)")
    if host == "127.0.0.1" and "--no-browser" not in sys.argv:
        threading.Timer(0.5, webbrowser.open, args=(f"http://127.0.0.1:{port}",)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBye!")


if __name__ == "__main__":
    main()
