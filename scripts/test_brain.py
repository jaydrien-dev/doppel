"""
End-to-end smoke test: send a message to the running brain and print the response.
Usage: uv run python scripts/test_brain.py

Requires the server to be running: uv run uvicorn doppel.main:app --reload
"""
import asyncio
import json
import uuid

import httpx

BASE_URL = "http://localhost:8000"
CLONE_ID = "00000000-0000-0000-0000-000000000001"
SESSION_ID = str(uuid.uuid4())


async def test_chat(message: str, context_type: str = "chat"):
    payload = {
        "clone_id": CLONE_ID,
        "session_id": SESSION_ID,
        "message": message,
        "context_type": context_type,
    }

    print(f"\n{'='*60}")
    print(f"Message: {message}")
    print(f"{'='*60}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{BASE_URL}/brain/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()

    print(f"Path taken  : {data['path_taken']}")
    print(f"Confidence  : {data['confidence']:.2f}")
    print(f"Latency     : {data.get('latency_ms', '?')}ms")
    print(f"Escalation  : {data['needs_escalation']}")
    print(f"\nResponse:\n{data['response']}")
    return data


async def test_feedback(trace_id: str):
    """Submit an edit correction to test the feedback loop."""
    payload = {
        "trace_id": trace_id,
        "clone_id": CLONE_ID,
        "signal_type": "edit",
        "corrected_response": "Actually, I'd phrase this differently — keep it short.",
        "correction_reason": "Too long for a chat context",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE_URL}/brain/feedback", json=payload)
    print(f"\nFeedback submitted: HTTP {resp.status_code}")


async def main():
    # Test 1: simple question → fast path
    result = await test_chat(
        "What's your philosophy on hiring?",
        context_type="chat",
    )

    # Test 2: decision → slow path
    await test_chat(
        "Should we raise a seed round now or wait until we have more traction? "
        "We have 20 users but strong engagement.",
        context_type="decision",
    )

    # Test 3: feedback loop
    trace_id = result.get("reasoning_trace_id")
    if trace_id:
        await test_feedback(trace_id)

    print(f"\n{'='*60}")
    print("Smoke test complete.")


if __name__ == "__main__":
    asyncio.run(main())
