#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import io
import contextlib
import http.cookiejar
import http.client
import json
import os
from datetime import datetime, timezone
import mimetypes
import posixpath
import re
import socket
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
APP_ROOT = ROOT / "assets" / "public"
GWCAJS_ROOT = ROOT / "GWCAjs"
MIRROR_ROOT = ROOT / "local-mirror"
PATCH_ROOT = "https://patching.1.arenanetworks.com/"
PATCH_ACCESS_KEY = "2043FE79-F32D-4FD7-8C27-0D47231C4F03"
PATCH_MIRROR_ROOT = MIRROR_ROOT / "patching.1.arenanetworks.com"
PROXY_COOKIE_JAR = http.cookiejar.CookieJar()
PROXY_OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(PROXY_COOKIE_JAR)
)
WEBGATE_SESSION: str | None = None
DEBUG_PROXY = os.environ.get("GW_PROXY_DEBUG") == "1"
PATCH_MIRROR_ENABLED = os.environ.get("GW_PATCH_MIRROR", "1") != "0"
PROXY_LOG_JSONL = os.environ.get("GW_PROXY_LOG_JSONL")
PROXY_RULES_PATH = os.environ.get("GW_PROXY_RULES")
WEBGATE_CREATE_PATH = "/session/create.xml"
WEBGATE_HOST = "webgate.ncplatform.net"
WEBGATE_PROXY_TAG = "webgate-auth-2026-06-03"
WEBGATE_DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 15; Switch OLED Build/BP1A.250505.005; wv) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
        "Chrome/146.0.7680.153 Safari/537.36"
    ),
    "Referer": "https://localhost/",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Android"',
}
WEBGATE_STRIPPED_HEADERS = (
    "Cookie",
    "Origin",
    "X-Requested-With",
)
INDEX_FETCH_SNIPPET = (
    'window.__GW_REFORGED_CONFIG__=i;const s=window.fetch.bind(window),'
    'u=typeof i.assetRoot=="string"&&i.assetRoot?r(i.assetRoot):"";'
    'window.fetch=(n,a)=>{let c=n,l=a;const h=typeof n=="string"?n:n instanceof URL?n.toString()'
    ':n instanceof Request?n.url:"",g=u&&h.startsWith(e)?u+h.slice(e.length):h,'
    'p=typeof i.accessKey=="string"&&i.accessKey&&(h.startsWith(e)||u&&h.startsWith(u)||g.startsWith(u));'
    'if(g&&g!==h&&(n instanceof Request?c=new Request(g,n):c=g),p){const f=new Headers('
    'c instanceof Request?c.headers:l?.headers);f.set("X-Access-Key",i.accessKey),'
    'l=Object.assign({},l,{headers:f}),c instanceof Request&&(c=new Request(c,l),l=void 0)}'
    'return s(c,l)};'
)
INDEX_FETCH_REPLACEMENT = (
    'window.__GW_REFORGED_CONFIG__=i;const s=window.fetch.bind(window),'
    'u=new URL("/proxy/patch/",location.href).href,'
    'f=typeof i.assetRoot=="string"&&i.assetRoot?r(i.assetRoot):u;'
    'window.fetch=(n,a)=>{let c=n,l=a;const h=typeof n=="string"?n:n instanceof URL?n.toString()'
    ':n instanceof Request?n.url:"",g=f&&h.startsWith(e)?f+h.slice(e.length):h,'
    'p=typeof i.accessKey=="string"&&i.accessKey&&(h.startsWith(e)||f&&h.startsWith(f)||g.startsWith(f));'
    'if(g&&g!==h&&(n instanceof Request?c=new Request(g,n):c=g),p){const m=new Headers('
    'c instanceof Request?c.headers:l?.headers);m.set("X-Access-Key",i.accessKey),'
    'l=Object.assign({},l,{headers:m}),c instanceof Request&&(c=new Request(c,l),l=void 0)}'
    'return s(c,l)};'
)
NETWORK_PROXY_SHIM = """<script>(()=>{const sameOrigin=t=>{try{return new URL(t,location.href).origin===location.origin}catch{return!0}},proxyUrl=t=>{const u=new URL('/proxy/http',location.href);u.searchParams.set('url',t);return u.toString()},nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{const raw=typeof input==='string'?input:input instanceof URL?input.toString():input instanceof Request?input.url:String(input);if(/^https?:/i.test(raw)&&!sameOrigin(raw)){if(input instanceof Request){input=new Request(proxyUrl(raw),input)}else input=proxyUrl(raw)}return nativeFetch(input,init)};const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){let next=url;const raw=typeof url==='string'?url:url instanceof URL?url.toString():String(url);if(/^https?:/i.test(raw)&&!sameOrigin(raw))next=proxyUrl(raw);return open.call(this,method,next,...rest)}})();</script>"""
STORAGE_SHIM = """<script>(()=>{if(!navigator.storage){navigator.storage={persisted:async()=>false,persist:async()=>false}}else{if(typeof navigator.storage.persisted!=='function')navigator.storage.persisted=async()=>false;if(typeof navigator.storage.persist!=='function')navigator.storage.persist=async()=>false}})();</script>"""
HOOK_CONFIG_SHIM = """<script>(()=>{const q=new URLSearchParams(location.search),read=(qp,ls)=>{let v=null;if(q.has(qp))v=q.get(qp);else v=localStorage.getItem(ls);const enabled=v==='1'||v==='true';if(q.has(qp))localStorage.setItem(ls,enabled?'1':'0');return enabled};window.__GW_DISABLE_IMAGE_DB__=read('gwDisableImageDb','gw.disableImageDb');window.__GW_DISABLE_JSPI__=read('gwDisableJspi','gw.disableJspi')})();</script>"""
HOOK_BOOTSTRAP_TAG = (
    '<script src="/gw-hook/diagnostics.js"></script>'
    '<script type="module" src="/gw-hook/bootstrap.js"></script>'
    '<script type="module" src="/gw-runtime/bootstrap.js"></script>'
    '<script type="module" src="/GWCAjs/bootstrap.js"></script>'
)
CLIENT_BUNDLE_PATH = "/_astro/Client.astro_astro_type_script_index_0_lang.wgoz1NN0.js"
CLIENT_STORAGE_SNIPPET = (
    "S.nativeAccount=Ye.getPlatformProviderAccount();"
    "S.secureStorage=rn.getPlatformSecureStorage();"
)
CLIENT_STORAGE_REPLACEMENT = """S.nativeAccount=Ye.getPlatformProviderAccount();S.secureStorage=rn.getPlatformSecureStorage()||{clearCredentials:async()=>{localStorage.removeItem("gw.credentials")},storeCredentials:async(t,e)=>{localStorage.setItem("gw.credentials",JSON.stringify({username:t,password:e}))},getCredentials:async()=>{const t=localStorage.getItem("gw.credentials");if(!t)throw new Error("No credentials found in secure storage");const e=JSON.parse(t);if(!e.username||!e.password)throw new Error("Invalid credentials format in secure storage");return e}};"""
CLIENT_IMAGE_DB_SNIPPET = 'localStorage:new ke("GwWeb-image")'
CLIENT_IMAGE_DB_REPLACEMENT = (
    'localStorage:window.__GW_DISABLE_IMAGE_DB__?null:new ke("GwWeb-image")'
)
CLIENT_JSPI_SNIPPET = 'function Ir(){return T.getPlatform()==="ios"?!1:"Suspending"in WebAssembly}'
CLIENT_JSPI_REPLACEMENT = 'function Ir(){return window.__GW_DISABLE_JSPI__?!1:T.getPlatform()==="ios"?!1:"Suspending"in WebAssembly}'

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/manifest+json", ".webmanifest")


def load_proxy_rules() -> list[dict]:
    raw_path = PROXY_RULES_PATH
    path = Path(raw_path) if raw_path else ROOT / "proxy_overrides.json"
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Failed to load proxy rules from {path}: {exc}")
        return []
    rules = data.get("rules")
    return rules if isinstance(rules, list) else []


PROXY_RULES = load_proxy_rules()


def get_preferred_lan_ip() -> str | None:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


class LocalWebAppHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _write_response_bytes(self, body: bytes) -> bool:
        try:
            self.wfile.write(body)
            return True
        except (BrokenPipeError, ConnectionResetError):
            if DEBUG_PROXY:
                print("[proxy] client disconnected while writing response")
            return False

    def translate_path(self, path: str) -> str:
        request_path = urllib.parse.urlparse(path).path
        normalized = posixpath.normpath(urllib.parse.unquote(request_path))

        if normalized.startswith("/mirror/"):
            root = MIRROR_ROOT
            relative = normalized[len("/mirror/") :]
        elif normalized.startswith("/GWCAjs/"):
            root = GWCAJS_ROOT
            relative = normalized[len("/GWCAjs/") :]
        else:
            root = APP_ROOT
            relative = normalized.lstrip("/")

        candidate = (root / relative).resolve()
        resolved_root = root.resolve()

        if not str(candidate).startswith(str(resolved_root)):
            return str(resolved_root)

        if candidate.is_dir():
            index_file = candidate / "index.html"
            if index_file.exists():
                return str(index_file)

        return str(candidate)

    def do_GET(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/__gw_proxy_version":
            self._serve_proxy_version()
            return
        if request_path in {"", "/", "/index.html"}:
            self._serve_index_html()
            return
        if request_path == "/vfs/cache.json":
            self._serve_vfs_cache_manifest()
            return
        if request_path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if request_path == CLIENT_BUNDLE_PATH:
            self._serve_client_bundle()
            return
        if request_path == "/proxy/http":
            self._proxy_http_request()
            return
        if self.path.startswith("/proxy/patch/"):
            self._proxy_patch_request()
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/__gw_proxy_version":
            self._serve_proxy_version()
            return
        if request_path in {"", "/", "/index.html"}:
            self._serve_index_html()
            return
        if request_path == "/vfs/cache.json":
            self._serve_vfs_cache_manifest()
            return
        if request_path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if request_path == CLIENT_BUNDLE_PATH:
            self._serve_client_bundle()
            return
        if request_path == "/proxy/http":
            self._proxy_http_request()
            return
        if self.path.startswith("/proxy/patch/"):
            self._proxy_patch_request()
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/proxy/http":
            self._proxy_http_request()
            return
        self.send_error(http.client.NOT_IMPLEMENTED)

    def do_PUT(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/proxy/http":
            self._proxy_http_request()
            return
        self.send_error(http.client.NOT_IMPLEMENTED)

    def do_DELETE(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/proxy/http":
            self._proxy_http_request()
            return
        self.send_error(http.client.NOT_IMPLEMENTED)

    def _serve_proxy_version(self) -> None:
        payload = {
            "tag": WEBGATE_PROXY_TAG,
            "source": str(Path(__file__).resolve()),
            "webgateCreatePath": WEBGATE_CREATE_PATH,
            "webgateHost": WEBGATE_HOST,
            "webgateRules": "builtin",
        }
        encoded = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        if self.command != "HEAD":
            self._write_response_bytes(encoded)

    def do_OPTIONS(self) -> None:
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == "/proxy/http":
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS")
            requested_headers = self.headers.get("Access-Control-Request-Headers")
            if requested_headers:
                self.send_header("Access-Control-Allow-Headers", requested_headers)
            self.end_headers()
            return
        super().do_OPTIONS()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def _serve_index_html(self) -> None:
        index_path = APP_ROOT / "index.html"
        content = index_path.read_text(encoding="utf-8")
        content = content.replace(INDEX_FETCH_SNIPPET, INDEX_FETCH_REPLACEMENT, 1)
        content = content.replace(
            '<script type="module" src="/_astro/Client.astro_astro_type_script_index_0_lang.wgoz1NN0.js"></script>',
            f"{NETWORK_PROXY_SHIM}{STORAGE_SHIM}{HOOK_CONFIG_SHIM}{HOOK_BOOTSTRAP_TAG} <script type=\"module\" src=\"/_astro/Client.astro_astro_type_script_index_0_lang.wgoz1NN0.js\"></script>",
            1,
        )
        encoded = content.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()

        if self.command != "HEAD":
            self.wfile.write(encoded)

    def _serve_vfs_cache_manifest(self) -> None:
        payload = json.dumps({"chunks": []}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self._write_response_bytes(payload)

    def _serve_client_bundle(self) -> None:
        bundle_path = APP_ROOT / CLIENT_BUNDLE_PATH.lstrip("/")
        content = bundle_path.read_text(encoding="utf-8")
        content = content.replace(
            CLIENT_STORAGE_SNIPPET,
            CLIENT_STORAGE_REPLACEMENT,
            1,
        )
        content = content.replace(
            CLIENT_IMAGE_DB_SNIPPET,
            CLIENT_IMAGE_DB_REPLACEMENT,
            1,
        )
        content = content.replace(
            CLIENT_JSPI_SNIPPET,
            CLIENT_JSPI_REPLACEMENT,
            1,
        )
        encoded = content.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()

        if self.command != "HEAD":
            self.wfile.write(encoded)

    def _proxy_patch_request(self) -> None:
        request_url = urllib.parse.urlparse(self.path)
        relative_path = request_url.path[len("/proxy/patch/") :]
        mirror_file = self._patch_mirror_file(relative_path)
        if PATCH_MIRROR_ENABLED and self.command in {"GET", "HEAD"} and mirror_file.exists():
            self._serve_patch_mirror_file(mirror_file)
            return

        upstream_url = urllib.parse.urljoin(PATCH_ROOT, relative_path)
        if request_url.query:
            upstream_url = f"{upstream_url}?{request_url.query}"

        headers = {
            "X-Access-Key": PATCH_ACCESS_KEY,
            "User-Agent": "GuildWarsReforgedLocalProxy/1.0",
        }
        if "Range" in self.headers:
            headers["Range"] = self.headers["Range"]
        if "If-None-Match" in self.headers:
            headers["If-None-Match"] = self.headers["If-None-Match"]
        if "If-Modified-Since" in self.headers:
            headers["If-Modified-Since"] = self.headers["If-Modified-Since"]

        upstream_request = urllib.request.Request(
            upstream_url,
            method=self.command,
            headers=headers,
        )
        self._log_proxy_request("patch", self.command, upstream_url, headers, None)

        try:
            with contextlib.closing(urllib.request.urlopen(upstream_request)) as upstream:
                self._log_proxy_response("patch", upstream.status, upstream)
                response_body = upstream.read()
                if PATCH_MIRROR_ENABLED and self.command == "GET" and upstream.status == 200:
                    self._write_patch_mirror_file(mirror_file, response_body, upstream)
                try:
                    self.send_response(upstream.status)
                    self._copy_upstream_headers(upstream, content_length=len(response_body))
                    self.end_headers()
                except (BrokenPipeError, ConnectionResetError):
                    if DEBUG_PROXY:
                        print("[proxy:patch] client disconnected before headers completed")
                    return

                if self.command != "HEAD":
                    self._write_response_bytes(response_body)
        except urllib.error.HTTPError as exc:
            self._log_proxy_error("patch", exc)
            response_body = exc.read()
            try:
                self.send_response(exc.code)
                self._copy_upstream_headers(exc, content_length=len(response_body))
                self.end_headers()
            except (BrokenPipeError, ConnectionResetError):
                if DEBUG_PROXY:
                    print("[proxy:patch] client disconnected before error headers completed")
                return
            if self.command != "HEAD" and response_body:
                self._log_proxy_error_body("patch", response_body)
                self._write_response_bytes(response_body)
        except (BrokenPipeError, ConnectionResetError):
            if DEBUG_PROXY:
                print("[proxy:patch] client disconnected")
            return
        except Exception as exc:
            self._log_proxy_exception("patch", exc)
            self.send_error(http.client.BAD_GATEWAY, explain=str(exc))

    def _patch_mirror_file(self, relative_path: str) -> Path:
        clean_path = posixpath.normpath("/" + urllib.parse.unquote(relative_path)).lstrip("/")
        return PATCH_MIRROR_ROOT / clean_path

    def _patch_mirror_meta_file(self, mirror_file: Path) -> Path:
        return mirror_file.with_name(mirror_file.name + ".headers.json")

    def _serve_patch_mirror_file(self, mirror_file: Path) -> None:
        meta_file = self._patch_mirror_meta_file(mirror_file)
        headers: dict[str, str] = {}
        if meta_file.exists():
            try:
                loaded = json.loads(meta_file.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    headers = {str(k): str(v) for k, v in loaded.items()}
            except Exception:
                headers = {}

        body = mirror_file.read_bytes()
        self.send_response(200)
        content_type = headers.get("Content-Type") or mimetypes.guess_type(mirror_file.name)[0] or "application/octet-stream"
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        etag = headers.get("ETag")
        if etag:
            self.send_header("ETag", etag)
        last_modified = headers.get("Last-Modified")
        if last_modified:
            self.send_header("Last-Modified", last_modified)
        self.send_header("X-GW-Mirror", "HIT")
        self.end_headers()

        if self.command != "HEAD":
            self._write_response_bytes(body)

    def _write_patch_mirror_file(self, mirror_file: Path, body: bytes, upstream: object) -> None:
        mirror_file.parent.mkdir(parents=True, exist_ok=True)
        temp_file = mirror_file.with_name(mirror_file.name + ".tmp")
        temp_file.write_bytes(body)
        temp_file.replace(mirror_file)

        headers_to_store = {}
        for key in ("Content-Type", "ETag", "Last-Modified"):
            value = getattr(upstream, "headers", {}).get(key)
            if value:
                headers_to_store[key] = str(value)
        self._patch_mirror_meta_file(mirror_file).write_text(
            json.dumps(headers_to_store, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        if DEBUG_PROXY:
            print(f"[proxy:patch] mirrored {mirror_file.relative_to(MIRROR_ROOT)}")

    def _proxy_http_request(self) -> None:
        global WEBGATE_SESSION
        request_url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(request_url.query)
        upstream_url = (query.get("url") or [None])[0]

        if not upstream_url:
            self.send_error(http.client.BAD_REQUEST, explain="missing url query parameter")
            return
        if not upstream_url.startswith(("http://", "https://")):
            self.send_error(http.client.BAD_REQUEST, explain="only http and https urls are supported")
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length > 0 else None

        headers = {
            "User-Agent": "GuildWarsReforgedLocalProxy/1.0",
        }
        for key in (
            "Accept",
            "Accept-Language",
            "Content-Type",
            "If-None-Match",
            "If-Modified-Since",
            "Range",
            "X-Requested-With",
        ):
            if key in self.headers:
                headers[key] = self.headers[key]

        method = self.command
        method, upstream_url, headers, body = self._apply_builtin_proxy_rules(
            method, upstream_url, headers, body
        )
        method, upstream_url, headers, body = self._apply_proxy_rules(
            method, upstream_url, headers, body
        )
        parsed_upstream = urllib.parse.urlparse(upstream_url)
        patch_mirror_file: Path | None = None
        if parsed_upstream.netloc == "patching.1.arenanetworks.com":
            patch_mirror_file = self._patch_mirror_file(parsed_upstream.path.lstrip("/"))
            if (
                PATCH_MIRROR_ENABLED
                and method in {"GET", "HEAD"}
                and patch_mirror_file.exists()
            ):
                self._serve_patch_mirror_file(patch_mirror_file)
                return
        if (
            parsed_upstream.netloc == WEBGATE_HOST
            and parsed_upstream.path != WEBGATE_CREATE_PATH
            and WEBGATE_SESSION
        ):
            headers["Authorization"] = f"Arena {WEBGATE_SESSION}"

        if self._is_webgate_create_request(parsed_upstream):
            self._log_webgate_create_request(method, upstream_url, headers, body)
        elif self._is_webgate_request(parsed_upstream):
            self._log_webgate_request(method, upstream_url, headers, body)

        upstream_request = urllib.request.Request(
            upstream_url,
            method=method,
            headers=headers,
            data=body,
        )
        self._log_proxy_request("http", method, upstream_url, headers, body)

        try:
            with contextlib.closing(PROXY_OPENER.open(upstream_request)) as upstream:
                self._log_proxy_response("http", upstream.status, upstream)
                response_body = upstream.read()
                if (
                    patch_mirror_file is not None
                    and PATCH_MIRROR_ENABLED
                    and method == "GET"
                    and upstream.status == 200
                ):
                    self._write_patch_mirror_file(patch_mirror_file, response_body, upstream)
                if (
                    parsed_upstream.netloc == WEBGATE_HOST
                    and parsed_upstream.path == WEBGATE_CREATE_PATH
                ):
                    session_match = re.search(
                        rb"<Session>\s*([^<\s]+)\s*</Session>", response_body
                    )
                    if session_match:
                        WEBGATE_SESSION = session_match.group(1).decode("utf-8", "replace")
                        if DEBUG_PROXY:
                            print(f"[proxy:http] captured webgate session: {WEBGATE_SESSION}")
                    self._log_webgate_create_response(upstream.status, response_body)
                elif self._is_webgate_request(parsed_upstream):
                    self._log_webgate_response(parsed_upstream.path, upstream.status)
                try:
                    self.send_response(upstream.status)
                    self.send_header("X-GW-Local-Proxy", WEBGATE_PROXY_TAG)
                    self._copy_upstream_headers(upstream, content_length=len(response_body))
                    self.end_headers()
                except (BrokenPipeError, ConnectionResetError):
                    if DEBUG_PROXY:
                        print("[proxy:http] client disconnected before headers completed")
                    return

                if self.command != "HEAD":
                    self._write_response_bytes(response_body)
        except urllib.error.HTTPError as exc:
            self._log_proxy_error("http", exc)
            response_body = exc.read()
            if self._is_webgate_create_request(parsed_upstream):
                self._log_webgate_create_response(exc.code, response_body)
            elif self._is_webgate_request(parsed_upstream):
                self._log_webgate_response(parsed_upstream.path, exc.code)
            try:
                self.send_response(exc.code)
                self.send_header("X-GW-Local-Proxy", WEBGATE_PROXY_TAG)
                self._copy_upstream_headers(exc, content_length=len(response_body))
                self.end_headers()
            except (BrokenPipeError, ConnectionResetError):
                if DEBUG_PROXY:
                    print("[proxy:http] client disconnected before error headers completed")
                return
            if self.command != "HEAD" and response_body:
                self._log_proxy_error_body("http", response_body)
                self._write_response_bytes(response_body)
        except (BrokenPipeError, ConnectionResetError):
            if DEBUG_PROXY:
                print("[proxy:http] client disconnected")
            return
        except Exception as exc:
            self._log_proxy_exception("http", exc)
            self.send_error(http.client.BAD_GATEWAY, explain=str(exc))

    def _apply_proxy_rules(
        self,
        method: str,
        upstream_url: str,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[str, str, dict[str, str], bytes | None]:
        parsed = urllib.parse.urlparse(upstream_url)

        for rule in PROXY_RULES:
            host = rule.get("host")
            path_prefix = rule.get("path_prefix")
            rule_method = rule.get("method")

            if host and parsed.netloc != host:
                continue
            if path_prefix and not parsed.path.startswith(path_prefix):
                continue
            if rule_method and method.upper() != str(rule_method).upper():
                continue

            if "force_method" in rule:
                method = str(rule["force_method"]).upper()

            remove_headers = rule.get("remove_headers") or []
            for header_name in remove_headers:
                headers.pop(header_name, None)

            set_headers = rule.get("set_headers") or {}
            for header_name, header_value in set_headers.items():
                headers[str(header_name)] = str(header_value)

            query_updates = rule.get("query") or {}
            if query_updates:
                query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
                for key, value in query_updates.items():
                    query[str(key)] = [str(value)]
                upstream_url = urllib.parse.urlunparse(
                    parsed._replace(
                        query=urllib.parse.urlencode(query, doseq=True)
                    )
                )
                parsed = urllib.parse.urlparse(upstream_url)

            if "body_text" in rule:
                body = str(rule["body_text"]).encode("utf-8")
            elif "body_base64" in rule:
                body = base64.b64decode(rule["body_base64"])

            if body is not None:
                headers["Content-Length"] = str(len(body))
            else:
                headers.pop("Content-Length", None)

        return method, upstream_url, headers, body

    def _apply_builtin_proxy_rules(
        self,
        method: str,
        upstream_url: str,
        headers: dict[str, str],
        body: bytes | None,
    ) -> tuple[str, str, dict[str, str], bytes | None]:
        parsed = urllib.parse.urlparse(upstream_url)
        if parsed.netloc != WEBGATE_HOST:
            return method, upstream_url, headers, body

        for header_name in WEBGATE_STRIPPED_HEADERS:
            headers.pop(header_name, None)
        headers.update(WEBGATE_DEFAULT_HEADERS)

        if parsed.path == WEBGATE_CREATE_PATH:
            headers["Authorization"] = "Arena 0"

        return method, upstream_url, headers, body

    def _is_webgate_create_request(self, parsed_upstream: urllib.parse.ParseResult) -> bool:
        return (
            parsed_upstream.netloc == WEBGATE_HOST
            and parsed_upstream.path == WEBGATE_CREATE_PATH
        )

    def _is_webgate_request(self, parsed_upstream: urllib.parse.ParseResult) -> bool:
        return parsed_upstream.netloc == WEBGATE_HOST

    def _redact_webgate_headers(self, headers: dict[str, str]) -> dict[str, str]:
        redacted: dict[str, str] = {}
        for key, value in headers.items():
            lowered = key.lower()
            if lowered == "authorization" and value != "Arena 0":
                redacted[key] = "Arena <redacted>"
            elif lowered == "cookie":
                redacted[key] = "<redacted>"
            else:
                redacted[key] = value
        return redacted

    def _safe_webgate_url(self, upstream_url: str) -> str:
        parsed = urllib.parse.urlparse(upstream_url)
        query = "<redacted>" if parsed.query else ""
        return urllib.parse.urlunparse(parsed._replace(query=query))

    def _log_webgate_request(
        self,
        method: str,
        upstream_url: str,
        headers: dict[str, str],
        body: bytes | None,
    ) -> None:
        print(f"[webgate] {method} {self._safe_webgate_url(upstream_url)}")
        print(f"[webgate] request headers: {self._redact_webgate_headers(headers)}")
        print(f"[webgate] request body bytes: {len(body) if body else 0}")

    def _log_webgate_response(self, path: str, status: int) -> None:
        print(f"[webgate] {path} response status: {status}")

    def _log_webgate_create_request(
        self,
        method: str,
        upstream_url: str,
        headers: dict[str, str],
        body: bytes | None,
    ) -> None:
        print(f"[webgate:create] {method} {upstream_url}")
        print(f"[webgate:create] request headers: {headers}")
        if body:
            print(f"[webgate:create] request body: {self._format_body(body)}")
        else:
            print("[webgate:create] request body: <empty>")

    def _log_webgate_create_response(self, status: int, body: bytes | None) -> None:
        print(f"[webgate:create] response status: {status}")
        if body:
            print(f"[webgate:create] response body: {self._format_body(body)}")
        else:
            print("[webgate:create] response body: <empty>")

    def _log_proxy_request(
        self,
        proxy_kind: str,
        method: str,
        upstream_url: str,
        headers: dict[str, str],
        body: bytes | None,
    ) -> None:
        if not DEBUG_PROXY:
            return
        print(f"[proxy:{proxy_kind}] {method} {upstream_url}")
        if headers:
            print(f"[proxy:{proxy_kind}] request headers: {headers}")
        if body:
            print(f"[proxy:{proxy_kind}] request body: {self._format_body(body)}")
        self._write_proxy_log(
            {
                "kind": proxy_kind,
                "stage": "request",
                "method": method,
                "url": upstream_url,
                "headers": headers,
                "body": self._format_body(body) if body else None,
            }
        )

    def _log_proxy_response(self, proxy_kind: str, status: int, upstream: object) -> None:
        if not DEBUG_PROXY:
            headers = dict(getattr(upstream, "headers", {}))
        else:
            headers = dict(getattr(upstream, "headers", {}))
            print(f"[proxy:{proxy_kind}] response status: {status}")
            if headers:
                print(f"[proxy:{proxy_kind}] response headers: {headers}")
        self._write_proxy_log(
            {
                "kind": proxy_kind,
                "stage": "response",
                "status": status,
                "headers": headers,
            }
        )

    def _log_proxy_error(self, proxy_kind: str, exc: urllib.error.HTTPError) -> None:
        if not DEBUG_PROXY:
            headers = dict(getattr(exc, "headers", {}))
        else:
            headers = dict(getattr(exc, "headers", {}))
            print(f"[proxy:{proxy_kind}] upstream error status: {exc.code}")
            print(f"[proxy:{proxy_kind}] upstream error headers: {headers}")
        self._write_proxy_log(
            {
                "kind": proxy_kind,
                "stage": "error",
                "status": exc.code,
                "headers": headers,
                "url": exc.geturl(),
            }
        )

    def _log_proxy_error_body(self, proxy_kind: str, body: bytes) -> None:
        if not DEBUG_PROXY:
            formatted = self._format_body(body)
        else:
            formatted = self._format_body(body)
            print(f"[proxy:{proxy_kind}] upstream error body: {formatted}")
        self._write_proxy_log(
            {
                "kind": proxy_kind,
                "stage": "error_body",
                "body": formatted,
            }
        )

    def _log_proxy_exception(self, proxy_kind: str, exc: Exception) -> None:
        if not DEBUG_PROXY:
            message = str(exc)
        else:
            message = str(exc)
            print(f"[proxy:{proxy_kind}] exception: {message}")
        self._write_proxy_log(
            {
                "kind": proxy_kind,
                "stage": "exception",
                "message": message,
            }
        )

    def _format_body(self, body: bytes) -> str:
        try:
            text = body.decode("utf-8")
        except UnicodeDecodeError:
            return f"<binary {len(body)} bytes base64={base64.b64encode(body).decode('ascii')}>"
        return text if len(text) <= 4000 else f"{text[:4000]}...<truncated>"

    def _write_proxy_log(self, payload: dict) -> None:
        if not PROXY_LOG_JSONL:
            return
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        try:
            with open(PROXY_LOG_JSONL, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry, ensure_ascii=True) + "\n")
        except Exception as exc:
            if DEBUG_PROXY:
                print(f"[proxy] failed to write log: {exc}")

    def _copy_upstream_headers(self, upstream: object, content_length: int | None = None) -> None:
        ignored = {
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailers",
            "transfer-encoding",
            "upgrade",
            "access-control-allow-origin",
            "cache-control",
        }
        for key, value in getattr(upstream, "headers", {}).items():
            if key.lower() in ignored:
                continue
            if content_length is not None and key.lower() == "content-length":
                continue
            self.send_header(key, value)
        if content_length is not None:
            self.send_header("Content-Length", str(content_length))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Serve the extracted Guild Wars Reforged web bundle locally."
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", default=8000, type=int, help="Bind port")
    args = parser.parse_args()

    if not APP_ROOT.exists():
        raise SystemExit(f"Missing web bundle directory: {APP_ROOT}")

    server = ThreadingHTTPServer((args.host, args.port), LocalWebAppHandler)
    print(f"Local proxy tag: {WEBGATE_PROXY_TAG}")
    print(f"Server source: {Path(__file__).resolve()}")
    if args.host == "0.0.0.0":
        lan_ip = get_preferred_lan_ip()
        print(f"Serving {APP_ROOT} at http://127.0.0.1:{args.port}/")
        if lan_ip:
            print(f"LAN URL: http://{lan_ip}:{args.port}/")
        print(f"Optional mirrored patch root: http://127.0.0.1:{args.port}/mirror/")
        print(f"Default patch proxy: http://127.0.0.1:{args.port}/proxy/patch/")
    else:
        print(f"Serving {APP_ROOT} at http://{args.host}:{args.port}/")
        print(f"Optional mirrored patch root: http://{args.host}:{args.port}/mirror/")
        print(f"Default patch proxy: http://{args.host}:{args.port}/proxy/patch/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
