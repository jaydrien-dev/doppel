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
        "Google Drive__create_folder",
        "Create a new folder in Google Drive.",
        {
            "name": {"type": "string", "description": "Folder name"},
            "parent_folder_id": {"type": "string", "description": "Parent folder ID (optional, default root)"},
        },
        required=["name"],
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
    _schema(
        "Google Drive__move_file",
        "Move a file to a different folder in Google Drive.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID to move"},
            "target_folder_id": {"type": "string", "description": "Destination folder ID"},
        },
        required=["file_id", "target_folder_id"],
    ),
    _schema(
        "Google Drive__copy_file",
        "Make a copy of a file in Google Drive.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID to copy"},
            "new_name": {"type": "string", "description": "Name for the copy (optional)"},
            "folder_id": {"type": "string", "description": "Folder to place the copy in (optional)"},
        },
        required=["file_id"],
    ),
    _schema(
        "Google Drive__share_file",
        "Share a file or folder with someone, granting them reader or editor access.",
        {
            "file_id": {"type": "string", "description": "Google Drive file ID"},
            "email": {"type": "string", "description": "Email address to share with"},
            "role": {"type": "string", "description": "Permission role: 'reader', 'commenter', or 'writer'", "default": "reader"},
        },
        required=["file_id", "email"],
    ),
    _schema(
        "Google Drive__create_spreadsheet",
        "Create a new Google Sheet and populate it with data rows. "
        "Use this for any request to create a spreadsheet, table, or CSV of data in Google Sheets.",
        {
            "name": {"type": "string", "description": "Spreadsheet title"},
            "headers": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Column header names, e.g. ['Name', 'Phone', 'Location']",
            },
            "rows": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
                "description": "Data rows — each row is a list of strings matching the headers",
            },
            "folder_id": {"type": "string", "description": "Parent Drive folder ID (optional)"},
        },
        required=["name", "headers", "rows"],
    ),
    _schema(
        "Google Drive__read_spreadsheet",
        "Read the contents of an existing Google Sheet.",
        {
            "file_id": {"type": "string", "description": "Google Sheets file ID"},
            "sheet_name": {"type": "string", "description": "Sheet tab name (default: Sheet1)", "default": "Sheet1"},
            "range": {"type": "string", "description": "Cell range like A1:D20 (optional, defaults to all data)"},
        },
        required=["file_id"],
    ),
    _schema(
        "Google Drive__append_to_spreadsheet",
        "Append rows to the end of an existing Google Sheet.",
        {
            "file_id": {"type": "string", "description": "Google Sheets file ID"},
            "rows": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
                "description": "Rows to append, each row is a list of strings",
            },
            "sheet_name": {"type": "string", "description": "Sheet tab name (default: Sheet1)", "default": "Sheet1"},
        },
        required=["file_id", "rows"],
    ),
    _schema(
        "Google Drive__update_spreadsheet_values",
        "Update specific cells in a Google Sheet.",
        {
            "file_id": {"type": "string", "description": "Google Sheets file ID"},
            "range": {"type": "string", "description": "Cell range to update, e.g. 'Sheet1!A1:C3'"},
            "values": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
                "description": "2D array of values to write",
            },
        },
        required=["file_id", "range", "values"],
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

    elif tool_name == "create_folder":
        name = args["name"]
        parent = args.get("parent_folder_id")
        metadata: dict = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent:
            metadata["parents"] = [parent]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://www.googleapis.com/drive/v3/files",
                headers={**h, "Content-Type": "application/json"},
                content=json.dumps(metadata),
            )
            r.raise_for_status()
        folder = r.json()
        return f"Folder '{name}' created (id: {folder.get('id')})"

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

    elif tool_name == "move_file":
        file_id = args["file_id"]
        target = args["target_folder_id"]
        # Get current parents first
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            meta = await c.get(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers=h,
                params={"fields": "parents,name"},
            )
            meta.raise_for_status()
            current_parents = ",".join(meta.json().get("parents", []))
            name = meta.json().get("name", file_id)
            r = await c.patch(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers={**h, "Content-Type": "application/json"},
                params={"addParents": target, "removeParents": current_parents, "fields": "id,name"},
                content=json.dumps({}),
            )
            r.raise_for_status()
        return f"Moved '{name}' to folder {target}"

    elif tool_name == "copy_file":
        file_id = args["file_id"]
        body: dict = {}
        if args.get("new_name"):
            body["name"] = args["new_name"]
        if args.get("folder_id"):
            body["parents"] = [args["folder_id"]]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://www.googleapis.com/drive/v3/files/{file_id}/copy",
                headers={**h, "Content-Type": "application/json"},
                content=json.dumps(body),
            )
            r.raise_for_status()
        copy = r.json()
        return f"Copied as '{copy.get('name')}' (id: {copy.get('id')})"

    elif tool_name == "share_file":
        file_id = args["file_id"]
        email = args["email"]
        role = args.get("role", "reader")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions",
                headers={**h, "Content-Type": "application/json"},
                json={"type": "user", "role": role, "emailAddress": email},
            )
            r.raise_for_status()
        return f"Shared with {email} as {role}"

    elif tool_name == "create_spreadsheet":
        name = args["name"]
        headers = args.get("headers", [])
        rows = args.get("rows", [])
        folder_id = args.get("folder_id")

        sheet_body: dict[str, Any] = {
            "properties": {"title": name},
            "sheets": [{"properties": {"title": "Sheet1"}}],
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://sheets.googleapis.com/v4/spreadsheets",
                headers={**h, "Content-Type": "application/json"},
                content=json.dumps(sheet_body),
            )
            r.raise_for_status()
        spreadsheet_id = r.json()["spreadsheetId"]
        spreadsheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"

        if folder_id:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                await c.patch(
                    f"https://www.googleapis.com/drive/v3/files/{spreadsheet_id}",
                    headers={**h, "Content-Type": "application/json"},
                    params={"addParents": folder_id, "removeParents": "root"},
                    content=json.dumps({}),
                )

        values = ([headers] if headers else []) + (rows or [])
        if values:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                r2 = await c.put(
                    f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/Sheet1!A1",
                    headers={**h, "Content-Type": "application/json"},
                    params={"valueInputOption": "RAW"},
                    content=json.dumps({"values": values}),
                )
                r2.raise_for_status()

        row_count = len(rows)
        return (
            f"Created Google Sheet '{name}' with {row_count} data row(s).\n"
            f"URL: {spreadsheet_url}\n"
            f"ID: {spreadsheet_id}"
        )

    elif tool_name == "read_spreadsheet":
        file_id = args["file_id"]
        sheet = args.get("sheet_name", "Sheet1")
        range_str = args.get("range", f"{sheet}!A1:Z1000")
        if "!" not in range_str:
            range_str = f"{sheet}!{range_str}"
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://sheets.googleapis.com/v4/spreadsheets/{file_id}/values/{range_str}",
                headers=h,
            )
            r.raise_for_status()
        values = r.json().get("values", [])
        if not values:
            return "Spreadsheet is empty."
        lines = []
        for row in values[:100]:
            lines.append("\t".join(str(cell) for cell in row))
        result = "\n".join(lines)
        if len(values) > 100:
            result += f"\n...[showing 100 of {len(values)} rows]"
        return result

    elif tool_name == "append_to_spreadsheet":
        file_id = args["file_id"]
        rows = args["rows"]
        sheet = args.get("sheet_name", "Sheet1")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://sheets.googleapis.com/v4/spreadsheets/{file_id}/values/{sheet}!A1:append",
                headers={**h, "Content-Type": "application/json"},
                params={"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"},
                content=json.dumps({"values": rows}),
            )
            r.raise_for_status()
        return f"Appended {len(rows)} row(s) to spreadsheet"

    elif tool_name == "update_spreadsheet_values":
        file_id = args["file_id"]
        range_str = args["range"]
        values = args["values"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.put(
                f"https://sheets.googleapis.com/v4/spreadsheets/{file_id}/values/{range_str}",
                headers={**h, "Content-Type": "application/json"},
                params={"valueInputOption": "RAW"},
                content=json.dumps({"values": values}),
            )
            r.raise_for_status()
        updated = r.json().get("updatedCells", "?")
        return f"Updated {updated} cell(s) in range {range_str}"

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
        "Gmail__list_emails",
        "List recent emails from inbox.",
        {
            "max_results": {"type": "integer", "description": "Max emails to return (default 10)", "default": 10},
        },
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
        "Gmail__get_thread",
        "Get all messages in an email thread.",
        {
            "thread_id": {"type": "string", "description": "Gmail thread ID"},
        },
        required=["thread_id"],
    ),
    _schema(
        "Gmail__send_email",
        "Send an email via Gmail.",
        {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Email subject"},
            "body": {"type": "string", "description": "Email body (plain text)"},
            "cc": {"type": "string", "description": "CC recipients, comma-separated (optional)"},
            "bcc": {"type": "string", "description": "BCC recipients, comma-separated (optional)"},
        },
        required=["to", "subject", "body"],
    ),
    _schema(
        "Gmail__reply_to_email",
        "Reply to an existing email thread.",
        {
            "email_id": {"type": "string", "description": "Message ID of the email to reply to"},
            "body": {"type": "string", "description": "Reply body text"},
            "reply_all": {"type": "boolean", "description": "Reply to all recipients (default false)", "default": False},
        },
        required=["email_id", "body"],
    ),
    _schema(
        "Gmail__forward_email",
        "Forward an email to another address.",
        {
            "email_id": {"type": "string", "description": "Message ID of the email to forward"},
            "to": {"type": "string", "description": "Recipient to forward to"},
            "note": {"type": "string", "description": "Optional note to prepend to the forwarded email"},
        },
        required=["email_id", "to"],
    ),
    _schema(
        "Gmail__create_draft",
        "Create an email draft in Gmail (does not send).",
        {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Email subject"},
            "body": {"type": "string", "description": "Email body (plain text)"},
            "cc": {"type": "string", "description": "CC recipients, comma-separated (optional)"},
        },
        required=["to", "subject", "body"],
    ),
    _schema(
        "Gmail__archive_email",
        "Archive an email (removes it from inbox without deleting).",
        {
            "email_id": {"type": "string", "description": "Gmail message ID"},
        },
        required=["email_id"],
    ),
    _schema(
        "Gmail__mark_email",
        "Mark an email as read or unread.",
        {
            "email_id": {"type": "string", "description": "Gmail message ID"},
            "action": {"type": "string", "description": "'read' or 'unread'"},
        },
        required=["email_id", "action"],
    ),
    _schema(
        "Gmail__add_label",
        "Add a label to an email.",
        {
            "email_id": {"type": "string", "description": "Gmail message ID"},
            "label_name": {"type": "string", "description": "Label name (e.g. 'Important', 'Work')"},
        },
        required=["email_id", "label_name"],
    ),
    _schema(
        "Gmail__delete_email",
        "Permanently delete an email. Use archive_email to keep it accessible.",
        {
            "email_id": {"type": "string", "description": "Gmail message ID"},
        },
        required=["email_id"],
    ),
    _schema(
        "Gmail__list_labels",
        "List all Gmail labels in the account.",
        {},
    ),
]


def _build_raw_email(to: str, subject: str, body: str, cc: str = "", bcc: str = "",
                     in_reply_to: str = "", references: str = "",
                     from_addr: str = "me") -> str:
    import base64 as _b64
    headers = f"To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n"
    if cc:
        headers += f"Cc: {cc}\r\n"
    if bcc:
        headers += f"Bcc: {bcc}\r\n"
    if in_reply_to:
        headers += f"In-Reply-To: {in_reply_to}\r\n"
    if references:
        headers += f"References: {references}\r\n"
    raw = headers + "\r\n" + body
    return _b64.urlsafe_b64encode(raw.encode()).decode()


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
        return (
            f"id: {msg.get('id')} | threadId: {msg.get('threadId')}\n"
            f"From: {hh.get('From','?')}\nDate: {hh.get('Date','?')}\n"
            f"Subject: {hh.get('Subject','?')}\n\n{body}"
        )

    elif tool_name == "get_thread":
        thread_id = args["thread_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}",
                headers=h,
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
            )
            r.raise_for_status()
        messages = r.json().get("messages", [])
        lines = [f"Thread {thread_id} — {len(messages)} message(s):"]
        for m in messages:
            hh = {x["name"]: x["value"] for x in m.get("payload", {}).get("headers", [])}
            lines.append(
                f"  • id:{m['id']} | {str(hh.get('Date','?'))[:16]} | "
                f"From: {hh.get('From','?')} | {hh.get('Subject','?')} | {m.get('snippet','')[:80]}"
            )
        return "\n".join(lines)

    elif tool_name == "send_email":
        encoded = _build_raw_email(
            to=args["to"],
            subject=args["subject"],
            body=args["body"],
            cc=args.get("cc", ""),
            bcc=args.get("bcc", ""),
        )
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={**h, "Content-Type": "application/json"},
                json={"raw": encoded},
            )
            r.raise_for_status()
        return f"Email sent to {args['to']}. Message id: {r.json().get('id')}"

    elif tool_name == "reply_to_email":
        email_id = args["email_id"]
        # Fetch original message headers
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            orig = await c.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{email_id}",
                headers=h,
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "To", "Cc", "Message-ID", "References"]},
            )
            orig.raise_for_status()
            msg = orig.json()
        hh = {x["name"]: x["value"] for x in msg.get("payload", {}).get("headers", [])}
        thread_id = msg.get("threadId")
        original_from = hh.get("From", "")
        original_to = hh.get("To", "")
        original_cc = hh.get("Cc", "")
        subject = hh.get("Subject", "")
        msg_id = hh.get("Message-ID", "")
        references = hh.get("References", "") + " " + msg_id

        to_field = original_from
        cc_field = ""
        if args.get("reply_all"):
            # combine original To + Cc, strip self
            all_recips = f"{original_to},{original_cc}".strip(",")
            cc_field = all_recips

        reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        encoded = _build_raw_email(
            to=to_field,
            subject=reply_subject,
            body=args["body"],
            cc=cc_field,
            in_reply_to=msg_id,
            references=references.strip(),
        )
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={**h, "Content-Type": "application/json"},
                json={"raw": encoded, "threadId": thread_id},
            )
            r.raise_for_status()
        return f"Reply sent to {to_field}. Message id: {r.json().get('id')}"

    elif tool_name == "forward_email":
        email_id = args["email_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            orig = await c.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{email_id}",
                headers=h,
                params={"format": "full"},
            )
            orig.raise_for_status()
            msg = orig.json()
        payload = msg.get("payload", {})
        hh = {x["name"]: x["value"] for x in payload.get("headers", [])}

        def _body_text(part: dict) -> str:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    import base64 as _b64
                    return _b64.urlsafe_b64decode(data + "==").decode(errors="replace")
            for sub in part.get("parts", []):
                t = _body_text(sub)
                if t:
                    return t
            return ""

        original_body = _body_text(payload)
        note = args.get("note", "")
        fwd_body = (
            f"{note}\n\n" if note else ""
        ) + (
            f"---------- Forwarded message ----------\n"
            f"From: {hh.get('From','?')}\n"
            f"Date: {hh.get('Date','?')}\n"
            f"Subject: {hh.get('Subject','?')}\n\n"
            f"{original_body[:3000]}"
        )
        subject = hh.get("Subject", "")
        fwd_subject = subject if subject.lower().startswith("fwd:") else f"Fwd: {subject}"
        encoded = _build_raw_email(to=args["to"], subject=fwd_subject, body=fwd_body)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={**h, "Content-Type": "application/json"},
                json={"raw": encoded},
            )
            r.raise_for_status()
        return f"Forwarded to {args['to']}. Message id: {r.json().get('id')}"

    elif tool_name == "create_draft":
        encoded = _build_raw_email(
            to=args["to"],
            subject=args["subject"],
            body=args["body"],
            cc=args.get("cc", ""),
        )
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
                headers={**h, "Content-Type": "application/json"},
                json={"message": {"raw": encoded}},
            )
            r.raise_for_status()
        return f"Draft created (id: {r.json().get('id')})"

    elif tool_name == "archive_email":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{args['email_id']}/modify",
                headers={**h, "Content-Type": "application/json"},
                json={"removeLabelIds": ["INBOX"]},
            )
            r.raise_for_status()
        return f"Email {args['email_id']} archived"

    elif tool_name == "mark_email":
        action = args["action"].lower()
        if action == "read":
            body = {"removeLabelIds": ["UNREAD"]}
        else:
            body = {"addLabelIds": ["UNREAD"]}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{args['email_id']}/modify",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        return f"Email marked as {action}"

    elif tool_name == "add_label":
        label_name = args["label_name"]
        # List labels to find ID
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            labels_r = await c.get("https://gmail.googleapis.com/gmail/v1/users/me/labels", headers=h)
            labels_r.raise_for_status()
            labels = labels_r.json().get("labels", [])
            label_id = next((l["id"] for l in labels if l["name"].lower() == label_name.lower()), None)
            if not label_id:
                # Create the label
                cr = await c.post(
                    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
                    headers={**h, "Content-Type": "application/json"},
                    json={"name": label_name},
                )
                cr.raise_for_status()
                label_id = cr.json().get("id")
            r = await c.post(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{args['email_id']}/modify",
                headers={**h, "Content-Type": "application/json"},
                json={"addLabelIds": [label_id]},
            )
            r.raise_for_status()
        return f"Label '{label_name}' added to email"

    elif tool_name == "delete_email":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.delete(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{args['email_id']}",
                headers=h,
            )
            r.raise_for_status()
        return f"Email {args['email_id']} permanently deleted"

    elif tool_name == "list_labels":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get("https://gmail.googleapis.com/gmail/v1/users/me/labels", headers=h)
            r.raise_for_status()
        labels = r.json().get("labels", [])
        user_labels = [l for l in labels if l.get("type") == "user"]
        system_labels = [l for l in labels if l.get("type") == "system"]
        lines = [f"Labels ({len(labels)} total):"]
        lines.append("  System: " + ", ".join(l["name"] for l in system_labels))
        if user_labels:
            lines.append("  Custom: " + ", ".join(l["name"] for l in user_labels))
        return "\n".join(lines)

    return f"[Unknown Gmail tool: {tool_name}]"


# ─── Google Calendar ──────────────────────────────────────────────────────────

_GCAL_TOOLS = [
    _schema(
        "Google Calendar__list_events",
        "List upcoming calendar events.",
        {
            "days_ahead": {"type": "integer", "description": "How many days ahead to look (default 7)", "default": 7},
            "max_results": {"type": "integer", "description": "Max events to return (default 10)", "default": 10},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
    ),
    _schema(
        "Google Calendar__get_event",
        "Get full details of a specific calendar event.",
        {
            "event_id": {"type": "string", "description": "Google Calendar event ID"},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["event_id"],
    ),
    _schema(
        "Google Calendar__search_events",
        "Search calendar events by keyword.",
        {
            "query": {"type": "string", "description": "Search term"},
            "max_results": {"type": "integer", "description": "Max events (default 10)", "default": 10},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["query"],
    ),
    _schema(
        "Google Calendar__create_event",
        "Create a new calendar event.",
        {
            "title": {"type": "string", "description": "Event title"},
            "start": {"type": "string", "description": "Start time in ISO 8601 (e.g. 2026-06-15T10:00:00)"},
            "end": {"type": "string", "description": "End time in ISO 8601"},
            "description": {"type": "string", "description": "Event description (optional)"},
            "location": {"type": "string", "description": "Event location (optional)"},
            "attendees": {"type": "array", "items": {"type": "string"}, "description": "Attendee emails (optional)"},
            "timezone": {"type": "string", "description": "Timezone (e.g. America/New_York, default UTC)", "default": "UTC"},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["title", "start", "end"],
    ),
    _schema(
        "Google Calendar__update_event",
        "Update an existing calendar event.",
        {
            "event_id": {"type": "string", "description": "Google Calendar event ID"},
            "title": {"type": "string", "description": "New event title (optional)"},
            "start": {"type": "string", "description": "New start time ISO 8601 (optional)"},
            "end": {"type": "string", "description": "New end time ISO 8601 (optional)"},
            "description": {"type": "string", "description": "New description (optional)"},
            "location": {"type": "string", "description": "New location (optional)"},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["event_id"],
    ),
    _schema(
        "Google Calendar__delete_event",
        "Delete a calendar event.",
        {
            "event_id": {"type": "string", "description": "Google Calendar event ID"},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["event_id"],
    ),
    _schema(
        "Google Calendar__list_calendars",
        "List all calendars in the Google Calendar account.",
        {},
    ),
    _schema(
        "Google Calendar__check_availability",
        "Check free/busy availability for a time range.",
        {
            "start": {"type": "string", "description": "Start of range ISO 8601"},
            "end": {"type": "string", "description": "End of range ISO 8601"},
            "emails": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Emails to check availability for (optional, defaults to self)",
            },
        },
        required=["start", "end"],
    ),
    _schema(
        "Google Calendar__respond_to_event",
        "Accept, decline, or mark tentative on a calendar event invitation.",
        {
            "event_id": {"type": "string", "description": "Google Calendar event ID"},
            "response": {"type": "string", "description": "'accepted', 'declined', or 'tentative'"},
            "calendar_id": {"type": "string", "description": "Calendar ID (default: primary)", "default": "primary"},
        },
        required=["event_id", "response"],
    ),
]


async def _call_gcal(tool_name: str, args: dict, token: str) -> str:
    from datetime import datetime, timezone, timedelta
    h = {"Authorization": f"Bearer {token}"}
    cal_id = args.get("calendar_id", "primary")

    if tool_name == "list_events":
        days = int(args.get("days_ahead", 7))
        max_r = int(args.get("max_results", 10))
        now = datetime.now(timezone.utc)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
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
            attendee_count = len(e.get("attendees", []))
            attendee_str = f" ({attendee_count} attendees)" if attendee_count else ""
            lines.append(f"  • {str(start)[:16].replace('T', ' ')} — {e.get('summary', '(no title)')}{attendee_str} [id: {e.get('id')}]")
        return "\n".join(lines)

    elif tool_name == "get_event":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{args['event_id']}",
                headers=h,
            )
            r.raise_for_status()
        e = r.json()
        start = e.get("start", {}).get("dateTime", e.get("start", {}).get("date", "?"))
        end = e.get("end", {}).get("dateTime", e.get("end", {}).get("date", "?"))
        attendees = ", ".join(a.get("email", "?") for a in e.get("attendees", []))
        return (
            f"Event: {e.get('summary', '(no title)')}\n"
            f"Start: {start}\nEnd: {end}\n"
            f"Location: {e.get('location', 'none')}\n"
            f"Description: {e.get('description', 'none')}\n"
            f"Attendees: {attendees or 'none'}\n"
            f"Link: {e.get('htmlLink', '')}"
        )

    elif tool_name == "search_events":
        q = args["query"]
        max_r = int(args.get("max_results", 10))
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
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
            lines.append(f"  • {str(start)[:16].replace('T', ' ')} — {e.get('summary', '(no title)')} [id: {e.get('id')}]")
        return "\n".join(lines)

    elif tool_name == "create_event":
        tz = args.get("timezone", "UTC")
        body: dict = {
            "summary": args["title"],
            "start": {"dateTime": args["start"], "timeZone": tz},
            "end": {"dateTime": args["end"], "timeZone": tz},
        }
        if args.get("description"):
            body["description"] = args["description"]
        if args.get("location"):
            body["location"] = args["location"]
        if args.get("attendees"):
            body["attendees"] = [{"email": e} for e in args["attendees"]]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
            ev = r.json()
        return f"Event created: '{ev.get('summary')}' at {str(ev.get('start',{}).get('dateTime','?'))[:16]}. Link: {ev.get('htmlLink','')}"

    elif tool_name == "update_event":
        event_id = args["event_id"]
        # Fetch current event
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            orig = await c.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{event_id}",
                headers=h,
            )
            orig.raise_for_status()
            body = orig.json()
        if args.get("title"):
            body["summary"] = args["title"]
        if args.get("start"):
            body["start"] = {"dateTime": args["start"], "timeZone": body.get("start", {}).get("timeZone", "UTC")}
        if args.get("end"):
            body["end"] = {"dateTime": args["end"], "timeZone": body.get("end", {}).get("timeZone", "UTC")}
        if args.get("description"):
            body["description"] = args["description"]
        if args.get("location"):
            body["location"] = args["location"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.put(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{event_id}",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        return f"Event updated: '{r.json().get('summary')}'"

    elif tool_name == "delete_event":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.delete(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{args['event_id']}",
                headers=h,
            )
            r.raise_for_status()
        return f"Event {args['event_id']} deleted"

    elif tool_name == "list_calendars":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers=h,
            )
            r.raise_for_status()
        cals = r.json().get("items", [])
        if not cals:
            return "No calendars found."
        lines = [f"Calendars ({len(cals)}):"]
        for cal in cals:
            primary = " [primary]" if cal.get("primary") else ""
            lines.append(f"  • {cal.get('summary','?')}{primary} (id: {cal.get('id')})")
        return "\n".join(lines)

    elif tool_name == "check_availability":
        emails = args.get("emails") or []
        items = [{"id": e} for e in emails] if emails else [{"id": "primary"}]
        body = {
            "timeMin": args["start"],
            "timeMax": args["end"],
            "items": items,
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://www.googleapis.com/calendar/v3/freeBusy",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        calendars = r.json().get("calendars", {})
        lines = [f"Availability from {args['start'][:16]} to {args['end'][:16]}:"]
        for cal_key, cal_data in calendars.items():
            busy = cal_data.get("busy", [])
            if busy:
                lines.append(f"  {cal_key}: BUSY during:")
                for b in busy:
                    lines.append(f"    {str(b.get('start','?'))[:16]} → {str(b.get('end','?'))[:16]}")
            else:
                lines.append(f"  {cal_key}: FREE")
        return "\n".join(lines)

    elif tool_name == "respond_to_event":
        event_id = args["event_id"]
        response = args["response"]  # accepted, declined, tentative
        # Get self email
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            me = await c.get("https://www.googleapis.com/calendar/v3/calendars/primary", headers=h)
            me.raise_for_status()
            self_email = me.json().get("id", "")
            orig = await c.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{event_id}",
                headers=h,
            )
            orig.raise_for_status()
            body = orig.json()
        # Update attendee response
        attendees = body.get("attendees", [])
        for att in attendees:
            if att.get("email", "").lower() == self_email.lower() or att.get("self"):
                att["responseStatus"] = response
        body["attendees"] = attendees
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.put(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events/{event_id}",
                headers={**h, "Content-Type": "application/json"},
                json=body,
                params={"sendUpdates": "all"},
            )
            r.raise_for_status()
        return f"Response '{response}' sent for event {event_id}"

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
        "GitHub Integration__get_repo_info",
        "Get details about a specific GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
        },
        required=["repo"],
    ),
    _schema(
        "GitHub Integration__list_issues",
        "List issues in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "state": {"type": "string", "description": "open, closed, or all (default: open)", "default": "open"},
            "labels": {"type": "string", "description": "Comma-separated label names to filter by (optional)"},
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
            "labels": {"type": "array", "items": {"type": "string"}, "description": "Labels to add (optional)"},
            "assignees": {"type": "array", "items": {"type": "string"}, "description": "GitHub usernames to assign (optional)"},
        },
        required=["repo", "title"],
    ),
    _schema(
        "GitHub Integration__comment_on_issue",
        "Add a comment to a GitHub issue.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "issue_number": {"type": "integer", "description": "Issue number"},
            "body": {"type": "string", "description": "Comment text"},
        },
        required=["repo", "issue_number", "body"],
    ),
    _schema(
        "GitHub Integration__close_issue",
        "Close a GitHub issue.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "issue_number": {"type": "integer", "description": "Issue number"},
            "comment": {"type": "string", "description": "Optional comment to leave when closing"},
        },
        required=["repo", "issue_number"],
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
    _schema(
        "GitHub Integration__create_pr",
        "Create a pull request in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "title": {"type": "string", "description": "PR title"},
            "body": {"type": "string", "description": "PR description"},
            "head": {"type": "string", "description": "Branch with changes (e.g. 'feature/my-branch')"},
            "base": {"type": "string", "description": "Target branch (e.g. 'main')"},
            "draft": {"type": "boolean", "description": "Create as draft PR (default false)", "default": False},
        },
        required=["repo", "title", "head", "base"],
    ),
    _schema(
        "GitHub Integration__comment_on_pr",
        "Add a review comment or general comment to a pull request.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "pr_number": {"type": "integer", "description": "Pull request number"},
            "body": {"type": "string", "description": "Comment text"},
        },
        required=["repo", "pr_number", "body"],
    ),
    _schema(
        "GitHub Integration__merge_pr",
        "Merge a pull request.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "pr_number": {"type": "integer", "description": "Pull request number"},
            "merge_method": {"type": "string", "description": "merge, squash, or rebase (default: merge)", "default": "merge"},
            "commit_message": {"type": "string", "description": "Custom merge commit message (optional)"},
        },
        required=["repo", "pr_number"],
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
        "GitHub Integration__push_file",
        "Create or update a file in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "path": {"type": "string", "description": "File path in the repo"},
            "content": {"type": "string", "description": "File content (plain text)"},
            "message": {"type": "string", "description": "Commit message"},
            "branch": {"type": "string", "description": "Branch to push to (default: main)", "default": "main"},
        },
        required=["repo", "path", "content", "message"],
    ),
    _schema(
        "GitHub Integration__list_branches",
        "List branches in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "max_results": {"type": "integer", "description": "Max branches (default 20)", "default": 20},
        },
        required=["repo"],
    ),
    _schema(
        "GitHub Integration__create_branch",
        "Create a new branch in a GitHub repository.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "branch_name": {"type": "string", "description": "Name for the new branch"},
            "from_branch": {"type": "string", "description": "Branch to create from (default: main)", "default": "main"},
        },
        required=["repo", "branch_name"],
    ),
    _schema(
        "GitHub Integration__list_commits",
        "List recent commits on a branch.",
        {
            "repo": {"type": "string", "description": "Repository in owner/name format"},
            "branch": {"type": "string", "description": "Branch name (default: main)", "default": "main"},
            "max_results": {"type": "integer", "description": "Max commits (default 10)", "default": 10},
        },
        required=["repo"],
    ),
    _schema(
        "GitHub Integration__list_notifications",
        "List GitHub notifications (mentions, reviews, assignments, etc.).",
        {
            "unread_only": {"type": "boolean", "description": "Show only unread (default true)", "default": True},
            "max_results": {"type": "integer", "description": "Max notifications (default 20)", "default": 20},
        },
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

    elif tool_name == "get_repo_info":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(f"https://api.github.com/repos/{repo}", headers=h)
            r.raise_for_status()
        d = r.json()
        return (
            f"{d.get('full_name')} — {d.get('description','no description')}\n"
            f"Stars: {d.get('stargazers_count',0)} | Forks: {d.get('forks_count',0)} | Open issues: {d.get('open_issues_count',0)}\n"
            f"Default branch: {d.get('default_branch','main')}\n"
            f"URL: {d.get('html_url','')}"
        )

    elif tool_name == "list_issues":
        repo = args["repo"]
        params: dict = {"state": args.get("state", "open"), "per_page": int(args.get("max_results", 10))}
        if args.get("labels"):
            params["labels"] = args["labels"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(f"https://api.github.com/repos/{repo}/issues", headers=h, params=params)
            r.raise_for_status()
        issues = [i for i in r.json() if "pull_request" not in i]
        if not issues:
            return f"No issues in {repo}."
        lines = [f"Issues in {repo}:"]
        for i in issues:
            labels = ", ".join(l["name"] for l in i.get("labels", []))
            label_str = f" [{labels}]" if labels else ""
            lines.append(f"  • #{i['number']} [{i['state']}]{label_str} {i['title']} ({i.get('user',{}).get('login','?')})")
        return "\n".join(lines)

    elif tool_name == "create_issue":
        repo = args["repo"]
        body: dict = {"title": args["title"], "body": args.get("body", "")}
        if args.get("labels"):
            body["labels"] = args["labels"]
        if args.get("assignees"):
            body["assignees"] = args["assignees"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"https://api.github.com/repos/{repo}/issues", headers={**h, "Content-Type": "application/json"}, json=body)
            r.raise_for_status()
            issue = r.json()
        return f"Issue created: #{issue['number']} '{issue['title']}' — {issue.get('html_url','')}"

    elif tool_name == "comment_on_issue":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://api.github.com/repos/{repo}/issues/{args['issue_number']}/comments",
                headers={**h, "Content-Type": "application/json"},
                json={"body": args["body"]},
            )
            r.raise_for_status()
        return f"Comment added to #{args['issue_number']} — {r.json().get('html_url','')}"

    elif tool_name == "close_issue":
        repo = args["repo"]
        num = args["issue_number"]
        if args.get("comment"):
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                await c.post(
                    f"https://api.github.com/repos/{repo}/issues/{num}/comments",
                    headers={**h, "Content-Type": "application/json"},
                    json={"body": args["comment"]},
                )
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.patch(
                f"https://api.github.com/repos/{repo}/issues/{num}",
                headers={**h, "Content-Type": "application/json"},
                json={"state": "closed"},
            )
            r.raise_for_status()
        return f"Issue #{num} closed"

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
            lines.append(f"  • #{pr['number']} [{pr['state']}] {pr['title']} ({pr.get('user',{}).get('login','?')}) {pr.get('head',{}).get('ref','')} → {pr.get('base',{}).get('ref','')}")
        return "\n".join(lines)

    elif tool_name == "create_pr":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://api.github.com/repos/{repo}/pulls",
                headers={**h, "Content-Type": "application/json"},
                json={
                    "title": args["title"],
                    "body": args.get("body", ""),
                    "head": args["head"],
                    "base": args["base"],
                    "draft": args.get("draft", False),
                },
            )
            r.raise_for_status()
            pr = r.json()
        return f"PR created: #{pr['number']} '{pr['title']}' — {pr.get('html_url','')}"

    elif tool_name == "comment_on_pr":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                f"https://api.github.com/repos/{repo}/issues/{args['pr_number']}/comments",
                headers={**h, "Content-Type": "application/json"},
                json={"body": args["body"]},
            )
            r.raise_for_status()
        return f"Comment added to PR #{args['pr_number']} — {r.json().get('html_url','')}"

    elif tool_name == "merge_pr":
        repo = args["repo"]
        body: dict = {"merge_method": args.get("merge_method", "merge")}
        if args.get("commit_message"):
            body["commit_message"] = args["commit_message"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.put(
                f"https://api.github.com/repos/{repo}/pulls/{args['pr_number']}/merge",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        return f"PR #{args['pr_number']} merged — {r.json().get('message','')}"

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

    elif tool_name == "push_file":
        import base64 as _b64
        repo = args["repo"]
        path = args["path"]
        branch = args.get("branch", "main")
        content_encoded = _b64.b64encode(args["content"].encode()).decode()
        body: dict = {
            "message": args["message"],
            "content": content_encoded,
            "branch": branch,
        }
        # Check if file exists to get SHA for update
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            existing = await c.get(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                headers=h,
                params={"ref": branch},
            )
            if existing.is_success:
                body["sha"] = existing.json().get("sha")
            r = await c.put(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                headers={**h, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        action = "updated" if "sha" in body else "created"
        return f"File {action}: {path} on {branch}"

    elif tool_name == "list_branches":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://api.github.com/repos/{repo}/branches",
                headers=h,
                params={"per_page": int(args.get("max_results", 20))},
            )
            r.raise_for_status()
        branches = r.json()
        if not branches:
            return f"No branches in {repo}."
        lines = [f"Branches in {repo}:"]
        for b in branches:
            lines.append(f"  • {b['name']}")
        return "\n".join(lines)

    elif tool_name == "create_branch":
        repo = args["repo"]
        from_branch = args.get("from_branch", "main")
        # Get SHA of source branch
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            ref_r = await c.get(
                f"https://api.github.com/repos/{repo}/git/ref/heads/{from_branch}",
                headers=h,
            )
            ref_r.raise_for_status()
            sha = ref_r.json().get("object", {}).get("sha")
            r = await c.post(
                f"https://api.github.com/repos/{repo}/git/refs",
                headers={**h, "Content-Type": "application/json"},
                json={"ref": f"refs/heads/{args['branch_name']}", "sha": sha},
            )
            r.raise_for_status()
        return f"Branch '{args['branch_name']}' created from '{from_branch}'"

    elif tool_name == "list_commits":
        repo = args["repo"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                f"https://api.github.com/repos/{repo}/commits",
                headers=h,
                params={"sha": args.get("branch", "main"), "per_page": int(args.get("max_results", 10))},
            )
            r.raise_for_status()
        commits = r.json()
        if not commits:
            return f"No commits found."
        lines = [f"Recent commits on {args.get('branch','main')} in {repo}:"]
        for c_item in commits:
            commit = c_item.get("commit", {})
            msg = commit.get("message", "").split("\n")[0][:80]
            author = commit.get("author", {}).get("name", "?")
            date = str(commit.get("author", {}).get("date", "?"))[:10]
            sha = c_item.get("sha", "?")[:7]
            lines.append(f"  • {sha} [{date}] {author}: {msg}")
        return "\n".join(lines)

    elif tool_name == "list_notifications":
        params: dict = {"per_page": int(args.get("max_results", 20))}
        if args.get("unread_only", True):
            params["all"] = "false"
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get("https://api.github.com/notifications", headers=h, params=params)
            r.raise_for_status()
        notifs = r.json()
        if not notifs:
            return "No notifications."
        lines = [f"Notifications ({len(notifs)}):"]
        for n in notifs:
            repo_name = n.get("repository", {}).get("full_name", "?")
            subject = n.get("subject", {})
            lines.append(f"  • [{n.get('reason','?')}] {repo_name} — {subject.get('title','?')} ({subject.get('type','?')})")
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
        "Slack__send_dm",
        "Send a direct message to a Slack user.",
        {
            "user_email": {"type": "string", "description": "Email address of the user to DM"},
            "text": {"type": "string", "description": "Message text"},
        },
        required=["user_email", "text"],
    ),
    _schema(
        "Slack__reply_to_thread",
        "Reply to a specific message thread in Slack.",
        {
            "channel": {"type": "string", "description": "Channel name or ID"},
            "thread_ts": {"type": "string", "description": "Timestamp of the parent message (thread ID)"},
            "text": {"type": "string", "description": "Reply text"},
        },
        required=["channel", "thread_ts", "text"],
    ),
    _schema(
        "Slack__list_channels",
        "List public channels in the Slack workspace.",
        {
            "max_results": {"type": "integer", "description": "Max channels (default 20)", "default": 20},
        },
    ),
    _schema(
        "Slack__get_channel_history",
        "Get recent messages from a Slack channel.",
        {
            "channel": {"type": "string", "description": "Channel name or ID"},
            "max_results": {"type": "integer", "description": "Max messages to return (default 20)", "default": 20},
        },
        required=["channel"],
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
    _schema(
        "Slack__add_reaction",
        "Add an emoji reaction to a Slack message.",
        {
            "channel": {"type": "string", "description": "Channel name or ID"},
            "timestamp": {"type": "string", "description": "Message timestamp"},
            "emoji": {"type": "string", "description": "Emoji name without colons (e.g. thumbsup, heart, white_check_mark)"},
        },
        required=["channel", "timestamp", "emoji"],
    ),
    _schema(
        "Slack__create_channel",
        "Create a new Slack channel.",
        {
            "name": {"type": "string", "description": "Channel name (lowercase, no spaces)"},
            "is_private": {"type": "boolean", "description": "Create as private channel (default false)", "default": False},
        },
        required=["name"],
    ),
    _schema(
        "Slack__set_status",
        "Set your Slack status.",
        {
            "text": {"type": "string", "description": "Status text"},
            "emoji": {"type": "string", "description": "Status emoji without colons (e.g. 'calendar', 'house')", "default": ""},
            "expiration_minutes": {"type": "integer", "description": "Minutes until status clears (0 = no expiry)", "default": 0},
        },
        required=["text"],
    ),
    _schema(
        "Slack__get_my_info",
        "Get information about the authenticated Slack user.",
        {},
    ),
    _schema(
        "Slack__list_workspace_members",
        "List members in the Slack workspace.",
        {
            "max_results": {"type": "integer", "description": "Max members to return (default 50)", "default": 50},
        },
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
        return f"Message sent to #{channel} ✓ (ts: {result.get('ts','')})"

    elif tool_name == "send_dm":
        user_email = args["user_email"]
        # Look up user by email
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            lookup = await c.get(
                "https://slack.com/api/users.lookupByEmail",
                headers=h,
                params={"email": user_email},
            )
            lookup.raise_for_status()
            user_data = lookup.json()
        if not user_data.get("ok"):
            return f"User not found: {user_data.get('error','unknown')}"
        user_id = user_data["user"]["id"]
        # Open DM channel
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            dm = await c.post(
                "https://slack.com/api/conversations.open",
                headers=h,
                json={"users": user_id},
            )
            dm.raise_for_status()
            channel_id = dm.json().get("channel", {}).get("id")
            r = await c.post(
                "https://slack.com/api/chat.postMessage",
                headers=h,
                json={"channel": channel_id, "text": args["text"]},
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to send DM: {result.get('error','unknown')}"
        return f"DM sent to {user_email} ✓"

    elif tool_name == "reply_to_thread":
        channel = args["channel"].lstrip("#")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://slack.com/api/chat.postMessage",
                headers=h,
                json={"channel": channel, "text": args["text"], "thread_ts": args["thread_ts"]},
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to reply: {result.get('error','unknown')}"
        return f"Reply sent in thread ✓"

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
            lines.append(f"  • #{ch.get('name','?')} — {ch.get('num_members',0)} members (id: {ch.get('id')})")
        return "\n".join(lines)

    elif tool_name == "get_channel_history":
        channel = args["channel"].lstrip("#")
        # Resolve name to ID if needed
        if not channel.startswith("C"):
            async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
                chans = await c.get(
                    "https://slack.com/api/conversations.list",
                    headers=h,
                    params={"limit": 200, "exclude_archived": "true"},
                )
                chans.raise_for_status()
                found = next((ch for ch in chans.json().get("channels", []) if ch.get("name") == channel), None)
                channel_id = found["id"] if found else channel
        else:
            channel_id = channel
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://slack.com/api/conversations.history",
                headers=h,
                params={"channel": channel_id, "limit": int(args.get("max_results", 20))},
            )
            r.raise_for_status()
            data = r.json()
        if not data.get("ok"):
            return f"Failed to get history: {data.get('error')}"
        messages = data.get("messages", [])
        if not messages:
            return "No messages found."
        lines = [f"Recent messages in #{channel}:"]
        for m in reversed(messages):
            user = m.get("user", m.get("username", "bot"))
            text = str(m.get("text", ""))[:120]
            lines.append(f"  [{user}] {text} (ts: {m.get('ts','')})")
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
            lines.append(f"  • [{m.get('channel',{}).get('name','?')}] {m.get('username','?')}: {str(m.get('text',''))[:100]} (ts: {m.get('ts','')})")
        return "\n".join(lines)

    elif tool_name == "add_reaction":
        channel = args["channel"].lstrip("#")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://slack.com/api/reactions.add",
                headers=h,
                json={"channel": channel, "timestamp": args["timestamp"], "name": args["emoji"].strip(":")},
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to add reaction: {result.get('error','unknown')}"
        return f"Reaction :{args['emoji']}: added ✓"

    elif tool_name == "create_channel":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://slack.com/api/conversations.create",
                headers=h,
                json={"name": args["name"].lower().replace(" ", "-"), "is_private": args.get("is_private", False)},
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to create channel: {result.get('error','unknown')}"
        ch = result.get("channel", {})
        return f"Channel #{ch.get('name')} created (id: {ch.get('id')})"

    elif tool_name == "set_status":
        import time
        expiry = int(args.get("expiration_minutes", 0))
        expiry_ts = int(time.time()) + expiry * 60 if expiry > 0 else 0
        emoji = args.get("emoji", "").strip(":")
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://slack.com/api/users.profile.set",
                headers=h,
                json={
                    "profile": {
                        "status_text": args["text"],
                        "status_emoji": f":{emoji}:" if emoji else "",
                        "status_expiration": expiry_ts,
                    }
                },
            )
            r.raise_for_status()
            result = r.json()
        if not result.get("ok"):
            return f"Failed to set status: {result.get('error','unknown')}"
        return f"Status set: {args['text']}"

    elif tool_name == "get_my_info":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get("https://slack.com/api/auth.test", headers=h)
            r.raise_for_status()
            data = r.json()
        if not data.get("ok"):
            return f"Failed: {data.get('error')}"
        return (
            f"User: {data.get('user')} (id: {data.get('user_id')})\n"
            f"Workspace: {data.get('team')} (id: {data.get('team_id')})\n"
            f"URL: {data.get('url','')}"
        )

    elif tool_name == "list_workspace_members":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(
                "https://slack.com/api/users.list",
                headers=h,
                params={"limit": int(args.get("max_results", 50))},
            )
            r.raise_for_status()
            data = r.json()
        if not data.get("ok"):
            return f"Failed: {data.get('error')}"
        members = [m for m in data.get("members", []) if not m.get("deleted") and not m.get("is_bot")]
        lines = [f"Workspace members ({len(members)}):"]
        for m in members:
            profile = m.get("profile", {})
            lines.append(f"  • {m.get('real_name','?')} (@{m.get('name','?')}) — {profile.get('email','no email')}")
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
            "filter_type": {"type": "string", "description": "Filter by type: 'page' or 'database' (optional)"},
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
    _schema(
        "Notion__update_page",
        "Update a Notion page's title or properties.",
        {
            "page_id": {"type": "string", "description": "Notion page ID"},
            "title": {"type": "string", "description": "New title (optional)"},
            "archived": {"type": "boolean", "description": "Archive/unarchive the page (optional)"},
        },
        required=["page_id"],
    ),
    _schema(
        "Notion__append_to_page",
        "Append content blocks to the end of a Notion page.",
        {
            "page_id": {"type": "string", "description": "Notion page ID"},
            "content": {"type": "string", "description": "Text content to append (will be added as paragraphs)"},
        },
        required=["page_id", "content"],
    ),
    _schema(
        "Notion__delete_page",
        "Archive (soft-delete) a Notion page.",
        {
            "page_id": {"type": "string", "description": "Notion page ID to archive"},
        },
        required=["page_id"],
    ),
    _schema(
        "Notion__list_databases",
        "List all databases the integration has access to.",
        {
            "max_results": {"type": "integer", "description": "Max databases (default 20)", "default": 20},
        },
    ),
    _schema(
        "Notion__get_database",
        "Get details and schema of a Notion database.",
        {
            "database_id": {"type": "string", "description": "Notion database ID"},
        },
        required=["database_id"],
    ),
    _schema(
        "Notion__query_database",
        "Query entries in a Notion database, optionally filtering.",
        {
            "database_id": {"type": "string", "description": "Notion database ID"},
            "max_results": {"type": "integer", "description": "Max entries to return (default 20)", "default": 20},
            "filter_property": {"type": "string", "description": "Property name to filter by (optional)"},
            "filter_value": {"type": "string", "description": "Value to filter for (optional)"},
        },
        required=["database_id"],
    ),
    _schema(
        "Notion__create_database_entry",
        "Create a new entry (page) in a Notion database.",
        {
            "database_id": {"type": "string", "description": "Notion database ID"},
            "title": {"type": "string", "description": "Title of the new entry"},
            "properties": {
                "type": "object",
                "description": "Additional properties as key-value pairs matching database schema (optional)",
            },
        },
        required=["database_id", "title"],
    ),
]


async def _call_notion(tool_name: str, args: dict, token: str) -> str:
    h = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28", "Content-Type": "application/json"}

    if tool_name == "search":
        body: dict = {"query": args["query"], "page_size": int(args.get("max_results", 10))}
        if args.get("filter_type"):
            body["filter"] = {"value": args["filter_type"], "property": "object"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post("https://api.notion.com/v1/search", headers=h, json=body)
            r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return f"No results found for '{args['query']}'."
        lines = [f"Notion results for '{args['query']}':"]
        for item in results:
            obj_type = item.get("object", "?")
            title = _notion_title(item)
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
                prefix = "• " if "bulleted" in btype else ("1. " if "numbered" in btype else ("# " if "heading" in btype else ""))
                content_lines.append(f"{prefix}{text}")
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
        # Split content into paragraphs
        paragraphs = [p.strip() for p in args["content"].split("\n") if p.strip()]
        children = [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": p}}]},
            }
            for p in paragraphs[:100]
        ]
        body = {
            "parent": parent,
            "properties": {"title": {"title": [{"type": "text", "text": {"content": args["title"]}}]}},
            "children": children,
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post("https://api.notion.com/v1/pages", headers=h, json=body)
            r.raise_for_status()
            page = r.json()
        return f"Page created: '{args['title']}' (id: {page.get('id')}) — {page.get('url','')}"

    elif tool_name == "update_page":
        page_id = args["page_id"]
        props: dict = {}
        if args.get("title"):
            props["title"] = {"title": [{"type": "text", "text": {"content": args["title"]}}]}
        update_body: dict = {}
        if props:
            update_body["properties"] = props
        if "archived" in args:
            update_body["archived"] = args["archived"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.patch(f"https://api.notion.com/v1/pages/{page_id}", headers=h, json=update_body)
            r.raise_for_status()
        return f"Page {page_id} updated"

    elif tool_name == "append_to_page":
        page_id = args["page_id"]
        paragraphs = [p.strip() for p in args["content"].split("\n") if p.strip()]
        children = [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": p}}]},
            }
            for p in paragraphs[:100]
        ]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.patch(
                f"https://api.notion.com/v1/blocks/{page_id}/children",
                headers=h,
                json={"children": children},
            )
            r.raise_for_status()
        return f"Appended {len(children)} block(s) to page {page_id}"

    elif tool_name == "delete_page":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.patch(
                f"https://api.notion.com/v1/pages/{args['page_id']}",
                headers=h,
                json={"archived": True},
            )
            r.raise_for_status()
        return f"Page {args['page_id']} archived"

    elif tool_name == "list_databases":
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(
                "https://api.notion.com/v1/search",
                headers=h,
                json={"filter": {"value": "database", "property": "object"}, "page_size": int(args.get("max_results", 20))},
            )
            r.raise_for_status()
        dbs = r.json().get("results", [])
        if not dbs:
            return "No databases found."
        lines = [f"Databases ({len(dbs)}):"]
        for db in dbs:
            title = _notion_title(db)
            lines.append(f"  • {title} (id: {db.get('id')})")
        return "\n".join(lines)

    elif tool_name == "get_database":
        db_id = args["database_id"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.get(f"https://api.notion.com/v1/databases/{db_id}", headers=h)
            r.raise_for_status()
        db = r.json()
        title = _notion_title(db)
        props = list(db.get("properties", {}).keys())
        return f"Database: {title}\nID: {db_id}\nProperties: {', '.join(props)}"

    elif tool_name == "query_database":
        db_id = args["database_id"]
        body = {"page_size": int(args.get("max_results", 20))}
        if args.get("filter_property") and args.get("filter_value"):
            body["filter"] = {
                "property": args["filter_property"],
                "rich_text": {"contains": args["filter_value"]},
            }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"https://api.notion.com/v1/databases/{db_id}/query", headers=h, json=body)
            r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return "No entries found."
        lines = [f"Database entries ({len(results)}):"]
        for item in results:
            title = _notion_title(item)
            lines.append(f"  • {title} (id: {item.get('id')})")
        return "\n".join(lines)

    elif tool_name == "create_database_entry":
        db_id = args["database_id"]
        props: dict = {
            "title": {"title": [{"type": "text", "text": {"content": args["title"]}}]},
        }
        # Merge in any extra properties (best-effort, plain text)
        for key, value in (args.get("properties") or {}).items():
            if key.lower() != "title":
                props[key] = {"rich_text": [{"type": "text", "text": {"content": str(value)}}]}
        body = {
            "parent": {"database_id": db_id},
            "properties": props,
        }
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post("https://api.notion.com/v1/pages", headers=h, json=body)
            r.raise_for_status()
            page = r.json()
        return f"Entry '{args['title']}' created in database (id: {page.get('id')}) — {page.get('url','')}"

    return f"[Unknown Notion tool: {tool_name}]"


def _notion_title(item: dict) -> str:
    """Extract title from a Notion page or database object."""
    props = item.get("properties", {})
    title_prop = props.get("title") or props.get("Name") or {}
    title_arr = title_prop.get("title") or title_prop.get("rich_text") or []
    if title_arr:
        return "".join(t.get("plain_text", "") for t in title_arr)
    # Database title is at top level
    top_title = item.get("title", [])
    if top_title:
        return "".join(t.get("plain_text", "") for t in top_title)
    return "Untitled"


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
