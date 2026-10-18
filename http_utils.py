"""Small HTTP helpers shared by the API modules."""
import json
from fastapi import HTTPException, Request


async def read_json(request: Request, limit: int, too_large='Dữ liệu vượt giới hạn cho phép.'):
    """Read a JSON object body, stopping as soon as it exceeds `limit` bytes."""
    body = bytearray()
    async for block in request.stream():
        body.extend(block)
        if len(body) > limit:
            raise HTTPException(413, too_large)
    try:
        data = json.loads(body or b'{}')
    except ValueError:
        raise HTTPException(400, 'Nội dung yêu cầu không phải JSON hợp lệ.')
    if not isinstance(data, dict):
        raise HTTPException(400, 'Nội dung yêu cầu không hợp lệ.')
    return data
