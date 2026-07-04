"""
Native service connectors — call Google Drive, Gmail, GitHub, Slack, etc.
REST APIs directly using the stored OAuth access token, bypassing any MCP proxy.

These connectors are used by mcp_client.load_clone_tools() and tool_path.py
when a clone has a preset service connected (Google Drive, Gmail, GitHub, etc.).

Tool names follow the same namespace convention as the rest of mcp_client:
  "{ServerName}__{tool_name}"  e.g. "Google Drive__search_files"
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable, Coroutine

import httpx

_log = logging.getLogger(__name__)

_TIMEOUT = 20.0


def _schema(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required or [],
        },
    }


# ─── Google Drive ─────────────────────────────────────────────────────────────

_GDRIVE_TOOLS = [
    _schema(
        "Google Drive__search_files",
        "Search for files in Google Drive by name or content.",
        {
            "query": {"type": "string", "description": "Search query (file name or keyword)"},
            "max_results": {"type": "integer", "description": "Max files to return (default 10)", "default": 10},
        },
        required=["query"],
    ),
    _schema(
        "Google Drive__list_files",
        "List files in Google Drive, optionally filtered by folder.",
        {
            "folder_id": {"type": "string", "description": "Folder ID to list (omit for root)"},
            "max_results": {"type": "integer", "description": "Max files to return (default 20)", "default": 20},
        },
    ),
    _schema(
        "Google Drive__get_file_content",
        "Get the text content of a Google Doc, Sheet, or plain text file.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID"},
        },
        required=["file_id"],
    ),
    _schema(
        "Google Drive__create_file",
        "Create a new Google Doc in Drive.",
        {
            "name": {"type": "string", "description": "File name"},
            "content": {"type": "string", "description": "Text content"},
            "folder_id": {"type": "string", "description": "Parent folder ID (optional)"},
        },
        required=["name", "content"],
    ),
    _schema(
        "Google Drive__delete_file",
        "Move a file to trash in Google Drive. Use search_files first to find the file ID.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID to delete"},
        },
        required=["file_id"],
    ),
    _schema(
        "Google Drive__rename_file",
        "Rename a file in Google Drive.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID"},
            "new_name": {"type": "string", "description": "New file name"},
        },
        required=["file_id", "new_name"],
    ),
]


async def _call_gdrive(tool_name: str, args: dict, token: str) -> str:
    h = {"Authorization": f"Bearer {token}"}

    if tool_name == "search_files":
        q = args["query"]
        max_r = int(args.get("max_results", 10))
        if "'" not in q and ":" not in q:
            q = f"name contains '{q}' or fullText contains '{q}'"
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=h,
                params={"q": q, "pageSize": max_r, "fields": "files(id,name,mimeType,modifiedTime)"},
            )
            r.raise_for_status()
        files = r.json().get("files", [])
        if not files:
            return "No files found matching your query."
        lines = [f"Found {len(files)} file(s):"]
        for f in files:
            lines.append(f"  • {f['name']}  (id: {f['id']}, modified: {str(f.get('modifiedTime','?'))[:10]})")
        return "\n".join(lines)

    elif tool_name == "list_files":
        folder_id = args.get("folder_id", "root")
        max_r = int(args.get("max_results", 20))
        q = f"'{folder_id}' in parents and trashed=false"
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=h,
                params={"q": q, "pageSize": max_r, "fields": "files(id,name,mimeType,modifiedTime)"},
            )
            r.raise_for_status()
        files = r.json().get("files", [])
        if not files:
            return "No files found."
        lines = [f"Files ({len(files)}):"]
        for f in files:
            mime = f.get("mimeType", "").split(".")[-1]
            lines.append(f"  • {f['name']}  ({mime}, id: {f['id']})")
        return "\n".join(lines)

    elif tool_name == "get_file_content":
        file_id = args["file_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            meta = await c.get(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers=h,
                params={"fields": "name,mimeType"},
            )
            meta.raise_for_status()
            mime = meta.json().get("mimeType", "")

            if "document" in mime:
                r = await c.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}/export",
                    headers=h,
                    params={"mimeType": "text/plain"},
                )
            elif "spreadsheet" in mime:
                r = await c.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}/export",
                    headers=h,
                    params={"mimeType": "text/csv"},
                )
            else:
                r = await c.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
                    headers=h,
                )
            r.raise_for_status()

        content = r.text
        if len(content) > 8000:
            content = content[:8000] + "\n...[truncated]"
        return f"File content:\n{content}"

    elif tool_name == "create_file":
        import io
        name = args["name"]
        content = args["content"]
        folder_id = args.get("folder_id")
        metadata: dict = {"name": name, "mimeType": "application/vnd.google-apps.document"}
        if folder_id:
            metadata["parents"] = [folder_id]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers=h,
                files={
                    "metadata": (None, json.dumps(metadata), "application/json"),
                    "file": (name, io.BytesIO(content.encode()), "text/plain"),
                },
            )
            r.raise_for_status()
        return f"Created '{name}' (id: {r.json().get('id')})"

    elif tool_name == "delete_file":
        file_id = args["file_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.delete(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers=h,
            )
            r.raise_for_status()
        return f"File moved to trash (id: {file_id})"

    elif tool_name == "rename_file":
        file_id = args["file_id"]
        new_name = args["new_name"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.patch(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers={**h, "Content-Type": "application/json"},
                content=json.dumps({"name": new_name}),
            )
            r.raise_for_status()
        return f"Renamed to '{new_name}'"

    return f"[Unknown Google Drive tool: {tool_name}]"


# ─── Gmail ────────────────────────────────────────────────────────────────────

_GMAIL_TOOLS = [
    _schema(
        "Gmail__search_emails",
        "Search emails in Gmail.",
        {
            "query": {"type": "string", "description": "Gmail search query (e.g. 'from:alice subject:budget')"},
            "max_results": {"type": "integer", "description": "Max emails to return (default 10)", "default": 10},
        },
        required=["query"],
    ),
    _schema(
        "Gmail__send_email",
        "Send an email via Gmail.",
        {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Email subject"},
            "body": {"type": "string", "description": "Email body (plain text)"},
        },
        required=["to", "subject", "body"],
    ),
    _schema(
        "Gmail__get_email",
        "Get the full content of an email by message ID.",
        {
            "email_id": {"type": "string", "description": "Gmail message ID"},
        },
        required=["email_id"],
    ),
    _schema(
        "Gmail__list_emails",
        "List recent emails from inbox.",
        {
            "max_results": {"type": "integer", "description": "Max emails to return (default 10)", "default": 10},
        },
    ),
]


async def _call_gmail(tool_name: str, args: dict, token: str) -> str:
    h = {"Authorization": f"Bearer {token}"}

    if tool_name in ("search_emails", "list_emails"):
        q = args.get("query", "in:inbox")
        max_r = int(args.get("max_results", 10))
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers=h,
                params={"q": q, "maxResults": max_r},
            )
            r.raise_for_status()
            msgs = r.json().get("messages", [])
        if not msgs:
            return "No emails found."

        results = [f"Found {len(msgs)} email(s):"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            for m in msgs[:min(len(msgs), 8)]:
                d = await c.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}",
                    headers=h,
                    params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
                )
                if d.is_success:
                    hh = {x["name"]: x["value"] for x in d.json().get("payload", {}).get("headers", [])}
                    snippet = d.json().get("snippet", "")
                    results.append(
                        f"  • id:{m['id']} | {str(hh.get('Date','?'))[:16]} | "
                        f"From: {hh.get('From','?')} | {hh.get('Subject','(no subject)')} | {snippet[:80]}"
                    )
        return "\n".join(results)

    elif tool_name == "send_email":
        import base64 as _b64
        raw = (
            f"To: {args['to']}\r\n"
            f"Subject: {args['subject']}\r\n"
            f"Content-Type: text/plain; charset=utf-8\r\n\r\n"
            f"{args['body']}"
        )
        encoded = _b64.urlsafe_b64encode(raw.encode()).decode()
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={**h, "Content-Type": "application/json"},
                json={"raw": encoded},
            )
            r.raise_for_status()
        return f"Email sent to {args['to']}. Message id: {r.json().get('id')}"

    elif tool_name == "get_email":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{args['email_id']}",
                headers=h,
                params={"format": "full"},
            )
            r.raise_for_status()
            msg = r.json()

        payload = msg.get("payload", {})
        hh = {x["name"]: x["value"] for x in payload.get("headers", [])}

        def _body(part: dict) -> str:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    import base64 as _b64
                    return _b64.urlsafe_b64decode(data + "==").decode(errors="replace")
            for sub in part.get("parts", []):
                result = _body(sub)
                if result:
                    return result
            return ""

        body = _body(payload)
        if len(body) > 4000:
            body = body[:4000] + "\n...[truncated]"
        return f"From: {hh.get('From','?')}\nDate: {hh.get('Date','?')}\nSubject: {hh.get('Subject','?')}\n\n{body}"

    return f"[Unknown Gmail tool: {tool_name}]"


# ─── Google Calendar ──────────────────────────────────────────────────────────

_GCAL_TOOLS = [
    _schema(
        "Google Calendar__list_events",
        "List upcoming calendar events.",
        {
            "days_ahead": {"type": "integer", "description": "How many days ahead to look (default 7)", "default": 7},
            "max_results": {"type": "integer", "description": "Max events to return (default 10)", "default": 10},
        },
    ),
    _schema(
        "Google Calendar__create_event",
        "Create a new calendar event.",
        {
            "title": {"type": "string", "description": "Event title"},
            "start": {"type": "string", "description": "Start time in ISO 8601 (e.g. 2026-06-15T10:00:00)"},
            "end": {"type": "string", "description": "End time in ISO 8601"},
            "description": {"type": "string", "description": "Event description (optional)"},
            "attendees": {"type": "array", "items": {"type": "string"}, "description": "Attendee emails (optional)"},
        },
        required=["title", "start", "end"],
    ),
    _schema(
        "Google Calendar__search_events",
        "Search calendar events by keyword.",
        {
            "query": {"type": "string", "description": "Search term"},
            "max_results": {"type": "integer", "description": "Max events (default 10)", "default": 10},
        },
        required=["query"],
    ),
]


async def _call_gcal(tool_name: str, args: dict, token: str) -> str:
    from datetime import datetime, timezone, timedelta
    h = {"Authorization": f"Bearer {token}"}

    if tool_name == "list_events":
        days = int(args.get("days_ahead", 7))
        max_r = int(args.get("max_results", 10))
        now = datetime.now(timezone.utc)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers=h,
                params={
                    "timeMin": now.isoformat(),
                    "timeMax": (now + timedelta(days=days)).isoformat(),
                    "maxResults": max_r,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                },
            )
            r.raise_for_status()
        events = r.json().get("items", [])
        if not events:
            return f"No events in the next {days} days."
        lines = [f"Upcoming events (next {days} days):"]
        for e in events:
            start = e.get("start", {}).get("dateTime", e.get("start", {}).get("date", "?"))
            lines.append(f"  • {str(start)[:16].replace('T', ' ')} — {e.get('summary', '(no title)')}")
        return "\n".join(lines)

    elif tool_name == "create_event":
        body: dict = {
            "summary": args["title"],
            "start": {"dateTime": args["start"], "timeZone": "UTC"},
            "end": {"dateTime": args["end"], "timeZone": "UTC"},
        }
        if args.get("description"):
            body["description"] = args["description"]
        if args.get("attendees"):
            body["attendees"] = [{"email": e} for e in args["attendees"]]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
            ev = r.json()
        return f"Event created: '{ev.get('summary')}' at {str(ev.get('start',{}).get('dateTime','?'))[:16]}. Link: {ev.get('htmlLink','')}"

    elif tool_name == "search_events":
        q = args["query"]
        max_r = int(args.get("max_results", 10))
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers=h,
                params={"q": q, "maxResults": max_r, "singleEvents": "true", "orderBy": "startTime"},
            )
            r.raise_for_status()
        events = r.json().get("items", [])
        if not events:
            return f"No events found matching '{q}'."
        lines = [f"Events matching '{q}':"]
        for e in events:
            start = e.get("start", {}).get("dateTime", e.get("start", {}).get("date", "?"))
            lines.append(f"  • {str(start)[:16].replace('T', ' ')} — {e.get('summary', '(no title)')}")
        return "\n".join(lines)

    return f"[Unknown Google Calendar tool: {tool_name}]"


# ─── GitHub ───────────────────────────────────────────────────────────────────

_GITHUB_TOOLS = [
    _schema(
        "GitHub Integration__search_repos",
        "Search GitHub repositories.",
        {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results (default 10)", "default": 10},
        },
        required=["query"],
    ),
    _schema(
        "GitHub Integration__list_issues",
        "List issues in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "state": {"type": "string", "description": "open, closed, or all (default: open)", "default": "open"},
            "max_results": {"type": "integer", "description": "Max issues (default 10)", "default": 10},
        },
        required=["repo"],
    ),
    _schema(
        "GitHub Integration__create_issue",
        "Create a new issue in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "title": {"type": "string", "description": "Issue title"},
            "body": {"type": "string", "description": "Issue description"},
        },
        required=["repo", "title"],
    ),
    _schema(
        "GitHub Integration__get_file",
        "Get the content of a file from a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "path": {"type": "string", "description": "File path within the repository"},
            "ref": {"type": "string", "description": "Branch, tag, or SHA (default: main)", "default": "main"},
        },
        required=["repo", "path"],
    ),
    _schema(
        "GitHub Integration__list_prs",
        "List pull requests in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "state": {"type": "string", "description": "open, closed, or all (default: open)", "default": "open"},
            "max_results": {"type": "integer", "description": "Max PRs (default 10)", "default": 10},
        },
        required=["repo"],
    ),
]


async def _call_github(tool_name: str, args: dict, token: str) -> str:
    h = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    if tool_name == "search_repos":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://api.github.com/search/repositories",
                headers=h,
                params={"q": args["query"], "per_page": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
        items = r.json().get("items", [])
        if not items:
            return "No repositories found."
        lines = [f"Repositories ({len(items)}):"]
        for repo in items:
            lines.append(f"  • {repo['full_name']} ⭐{repo.get('stargazers_count',0)} — {str(repo.get('description',''))[:80]}")
        return "\n".join(lines)

    elif tool_name == "list_issues":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://api.github.com/repos/{repo}/issues",
                headers=h,
                params={"state": args.get("state", "open"), "per_page": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
        issues = [i for i in r.json() if "pull_request" not in i]
        if not issues:
            return f"No issues in {repo}."
        lines = [f"Issues in {repo}:"]
        for i in issues:
            lines.append(f"  • #{i['number']} [{i['state']}] {i['title']} ({i.get('user',{}).get('login','?')})")
        return "\n".join(lines)

    elif tool_name == "create_issue":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://api.github.com/repos/{repo}/issues",
                headers={**h, "Content-Type": "application/json"},
                json={"title": args["title"], "body": args.get("body", "")},
            )
            r.raise_for_status()
            issue = r.json()
        return f"Issue created: #{issue['number']} '{issue['title']}' — {issue.get('html_url','')}"

    elif tool_name == "get_file":
        import base64 as _b64
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://api.github.com/repos/{repo}/contents/{args['path']}",
                headers=h,
                params={"ref": args.get("ref", "main")},
            )
            r.raise_for_status()
        content = _b64.b64decode(r.json().get("content", "").replace("\n", "")).decode(errors="replace")
        if len(content) > 6000:
            content = content[:6000] + "\n...[truncated]"
        return f"File: {args['path']}\n\n{content}"

    elif tool_name == "list_prs":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://api.github.com/repos/{repo}/pulls",
                headers=h,
                params={"state": args.get("state", "open"), "per_page": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
        prs = r.json()
        if not prs:
            return f"No pull requests in {repo}."
        lines = [f"Pull requests in {repo}:"]
        for pr in prs:
            lines.append(f"  • #{pr['number']} [{pr['state']}] {pr['title']} ({pr.get('user',{}).get('login','?')})")
        return "\n".join(lines)

    return f"[Unknown GitHub tool: {tool_name}]"


# ─── Slack ────────────────────────────────────────────────────────────────────

_SLACK_TOOLS = [
    _schema(
        "Slack__send_message",
        "Send a message to a Slack channel.",
        {
            "channel": {"type": "string", "description": "Channel name (e.g. general) or ID"},
            "text": {"type": "string", "description": "Message text"},
        },
        required=["channel", "text"],
    ),
    _schema(
        "Slack__list_channels",
        "List public channels in the Slack workspace.",
        {
            "max_results": {"type": "integer", "description": "Max channels (default 20)", "default": 20},
        },
    ),
    _schema(
        "Slack__search_messages",
        "Search messages in Slack.",
        {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results (default 10)", "default": 10},
        },
        required=["query"],
    ),
]


async def _call_slack(tool_name: str, args: dict, token: str) -> str:
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}

    if tool_name == "send_message":
        channel = args["channel"].lstrip("#")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://slack.com/api/chat.postMessage",
                headers=h,
                json={"channel": channel, "text": args["text"]},
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to send: {result.get('error', 'unknown error')}"
        return f"Message sent to #{channel} ✓"

    elif tool_name == "list_channels":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://slack.com/api/conversations.list",
                headers=h,
                params={"limit": int(args.get("max_results", 20)), "exclude_archived": "true"},
            )
            r.raise_for_status()
            data = r.json()
        if not data.get("ok"):
            return f"Failed to list channels: {data.get('error')}"
        channels = data.get("channels", [])
        if not channels:
            return "No channels found."
        lines = [f"Channels ({len(channels)}):"]
        for ch in channels:
            lines.append(f"  • #{ch.get('name','?')} — {ch.get('num_members',0)} members")
        return "\n".join(lines)

    elif tool_name == "search_messages":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://slack.com/api/search.messages",
                headers=h,
                params={"query": args["query"], "count": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
            data = r.json()
        if not data.get("ok"):
            return f"Search failed: {data.get('error')}"
        matches = data.get("messages", {}).get("matches", [])
        if not matches:
            return f"No messages found for '{args['query']}'."
        lines = [f"Messages matching '{args['query']}':"]
        for m in matches:
            lines.append(f"  • [{m.get('channel',{}).get('name','?')}] {m.get('username','?')}: {str(m.get('text',''))[:100]}")
        return "\n".join(lines)

    return f"[Unknown Slack tool: {tool_name}]"


# ─── Notion ───────────────────────────────────────────────────────────────────

_NOTION_TOOLS = [
    _schema(
        "Notion__search",
        "Search pages and databases in Notion.",
        {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results (default 10)", "default": 10},
        },
        required=["query"],
    ),
    _schema(
        "Notion__get_page",
        "Get the text content of a Notion page.",
        {
            "page_id": {"type": "string", "description": "Notion page ID"},
        },
        required=["page_id"],
    ),
    _schema(
        "Notion__create_page",
        "Create a new page in Notion.",
        {
            "title": {"type": "string", "description": "Page title"},
            "content": {"type": "string", "description": "Page content (plain text)"},
            "parent_page_id": {"type": "string", "description": "Parent page ID (optional)"},
        },
        required=["title", "content"],
    ),
]


async def _call_notion(tool_name: str, args: dict, token: str) -> str:
    h = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28", "Content-Type": "application/json"}

    if tool_name == "search":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://api.notion.com/v1/search",
                headers=h,
                json={"query": args["query"], "page_size": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return f"No results found for '{args['query']}'."
        lines = [f"Notion results for '{args['query']}':"]
        for item in results:
            obj_type = item.get("object", "?")
            title = "Untitled"
            props = item.get("properties", {})
            title_prop = props.get("title") or props.get("Name") or {}
            title_arr = title_prop.get("title") or title_prop.get("rich_text") or []
            if title_arr:
                title = "".join(t.get("plain_text", "") for t in title_arr)
            lines.append(f"  • [{obj_type}] {title} (id: {item['id']})")
        return "\n".join(lines)

    elif tool_name == "get_page":
        page_id = args["page_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            blocks = await c.get(f"https://api.notion.com/v1/blocks/{page_id}/children", headers=h)
            blocks.raise_for_status()
        content_lines = []
        for b in blocks.json().get("results", [])[:50]:
            btype = b.get("type", "")
            text_arr = b.get(btype, {}).get("rich_text", [])
            text = "".join(t.get("plain_text", "") for t in text_arr)
            if text:
                content_lines.append(text)
        content = "\n".join(content_lines)
        if len(content) > 4000:
            content = content[:4000] + "\n...[truncated]"
        return f"Page content:\n{content}" if content else "Page has no text content."

    elif tool_name == "create_page":
        parent = (
            {"type": "page_id", "page_id": args["parent_page_id"]}
            if args.get("parent_page_id")
            else {"type": "workspace", "workspace": True}
        )
        body = {
            "parent": parent,
            "properties": {"title": {"title": [{"type": "text", "text": {"content": args["title"]}}]}},
            "children": [{
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": args["content"]}}]},
            }],
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post("https://api.notion.com/v1/pages", headers=h, json=body)
            r.raise_for_status()
            page = r.json()
        return f"Page created: '{args['title']}' (id: {page.get('id')}) — {page.get('url','')}"

    return f"[Unknown Notion tool: {tool_name}]"


# ─── Registry ─────────────────────────────────────────────────────────────────

# Maps MCPServer.name → (tool_schemas, call_function)
async def _call_web(tool_name: str, args: dict, _token: str) -> str:
    from doppel.brain.tools.web_tools import call_web_tool
    return await call_web_tool(tool_name, args)


_REGISTRY: dict[str, tuple[list[dict], Callable[..., Coroutine[Any, Any, str]]]] = {
    "Google Drive":       (_GDRIVE_TOOLS,   _call_gdrive),
    "Gmail":              (_GMAIL_TOOLS,    _call_gmail),
    "Google Calendar":    (_GCAL_TOOLS,     _call_gcal),
    "GitHub Integration": (_GITHUB_TOOLS,   _call_github),
    "Slack":              (_SLACK_TOOLS,    _call_slack),
    "Notion":             (_NOTION_TOOLS,   _call_notion),
    "Web":                ([], _call_web),  # tool list injected dynamically by load_clone_tools
}


import re as _re


def _safe_name(name: str) -> str:
    """Sanitize a string to match Anthropic's tool name requirement: [a-zA-Z0-9_-]"""
    return _re.sub(r"[^a-zA-Z0-9_-]", "_", name)


def get_native_tools(server_name: str) -> list[dict] | None:
    """
    Return Anthropic-format tool schemas for a natively supported service, else None.
    Tool names are sanitized so they satisfy Anthropic's [a-zA-Z0-9_-] constraint.
    """
    entry = _REGISTRY.get(server_name)
    if not entry:
        return None
    tools, _ = entry
    safe_prefix = _safe_name(server_name) + "__"
    orig_prefix = server_name + "__"
    sanitized = []
    for t in tools:
        name = t["name"]
        # Replace original "Server Name__tool" with "Server_Name__tool"
        if name.startswith(orig_prefix):
            name = safe_prefix + name[len(orig_prefix):]
        sanitized.append({**t, "name": name})
    return sanitized


async def call_native_tool(server_name: str, tool_name: str, args: dict, access_token: str) -> str:
    """
    Execute a tool via its native REST API connector.
    tool_name may be in sanitized form ("Google_Drive__search_files") or
    original form ("Google Drive__search_files") — both are handled.
    """
    entry = _REGISTRY.get(server_name)
    if not entry:
        return f"[No native connector for {server_name}]"

    _, call_fn = entry

    # Strip server name prefix (handle both sanitized and original forms)
    safe_prefix = _safe_name(server_name) + "__"
    orig_prefix = server_name + "__"
    if tool_name.startswith(safe_prefix):
        bare = tool_name[len(safe_prefix):]
    elif tool_name.startswith(orig_prefix):
        bare = tool_name[len(orig_prefix):]
    else:
        bare = tool_name

    try:
        return await call_fn(bare, args, access_token)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        _log.warning("Native connector %s HTTP %s for %s", server_name, status, tool_name)
        if status == 401:
            return f"[{server_name}] Authorization failed — token may have expired. Reconnect in Settings."
        return f"[{server_name}] API error {status}: {exc.response.text[:200]}"
    except Exception as exc:
        _log.warning("Native connector %s error for %s: %s", server_name, tool_name, exc)
        return f"[{server_name}] Error: {exc}"
