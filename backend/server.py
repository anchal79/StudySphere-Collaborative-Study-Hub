from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import socketio
import uvicorn

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = "studysphere_secret_key_2024"
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Security
security = HTTPBearer()

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True
)

# Create the main app
app = FastAPI(title="StudySphere API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# In-memory storage for real-time data
active_rooms = {}  # room_id: {users: [], notes_content: "", chat_messages: []}
connected_users = {}  # socket_id: {user_id, username, room_id}

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    room_code: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    participants: List[str] = []

class RoomCreate(BaseModel):
    name: str

class RoomJoin(BaseModel):
    room_code: str

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    user_id: str
    username: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class NoteUpdate(BaseModel):
    room_id: str
    content: str

# Utility functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_room_code() -> str:
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

# Authentication Routes
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check username
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(user_data.password)
    )
    
    await db.users.insert_one(user.dict())
    
    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "email": user.email}
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"email": user_data.email})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = User(**user_doc)
    
    # Verify password
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "username": user.username, "email": user.email}
    }

# Room Routes
@api_router.post("/rooms/create")
async def create_room(room_data: RoomCreate, current_user: User = Depends(get_current_user)):
    room = Room(
        name=room_data.name,
        room_code=generate_room_code(),
        created_by=current_user.id,
        participants=[current_user.id]
    )
    
    await db.rooms.insert_one(room.dict())
    
    # Initialize room data
    active_rooms[room.id] = {
        "users": [],
        "notes_content": "",
        "chat_messages": []
    }
    
    return room

@api_router.post("/rooms/join")
async def join_room(room_data: RoomJoin, current_user: User = Depends(get_current_user)):
    # Find room by code
    room_doc = await db.rooms.find_one({"room_code": room_data.room_code})
    if not room_doc:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = Room(**room_doc)
    
    # Add user to participants if not already
    if current_user.id not in room.participants:
        room.participants.append(current_user.id)
        await db.rooms.update_one(
            {"id": room.id},
            {"$set": {"participants": room.participants}}
        )
    
    # Initialize room data if not exists
    if room.id not in active_rooms:
        active_rooms[room.id] = {
            "users": [],
            "notes_content": "",
            "chat_messages": []
        }
    
    return room

@api_router.get("/rooms/my-rooms")
async def get_my_rooms(current_user: User = Depends(get_current_user)):
    rooms = await db.rooms.find({"participants": current_user.id}).to_list(100)
    return [Room(**room) for room in rooms]

# Socket.IO Events
@sio.event
async def connect(sid, environ, auth):
    print(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    if sid in connected_users:
        user_data = connected_users[sid]
        room_id = user_data.get("room_id")
        
        if room_id and room_id in active_rooms:
            # Remove user from room
            active_rooms[room_id]["users"] = [
                u for u in active_rooms[room_id]["users"] 
                if u["socket_id"] != sid
            ]
            
            # Notify other users
            await sio.emit("user_left", {
                "username": user_data.get("username"),
                "users": active_rooms[room_id]["users"]
            }, room=room_id)
        
        del connected_users[sid]
    
    print(f"Client {sid} disconnected")

@sio.event
async def join_room(sid, data):
    room_id = data.get("room_id")
    user_data = data.get("user")
    
    if not room_id or not user_data:
        return
    
    # Join socket room
    await sio.enter_room(sid, room_id)
    
    # Store user connection data
    connected_users[sid] = {
        "user_id": user_data["id"],
        "username": user_data["username"],
        "room_id": room_id,
        "socket_id": sid
    }
    
    # Initialize room if not exists
    if room_id not in active_rooms:
        active_rooms[room_id] = {
            "users": [],
            "notes_content": "",
            "chat_messages": []
        }
    
    # Add user to room
    user_info = {
        "socket_id": sid,
        "user_id": user_data["id"],
        "username": user_data["username"]
    }
    
    # Remove existing user if reconnecting
    active_rooms[room_id]["users"] = [
        u for u in active_rooms[room_id]["users"] 
        if u["user_id"] != user_data["id"]
    ]
    active_rooms[room_id]["users"].append(user_info)
    
    # Send current state to joining user
    await sio.emit("room_state", {
        "notes_content": active_rooms[room_id]["notes_content"],
        "chat_messages": active_rooms[room_id]["chat_messages"],
        "users": active_rooms[room_id]["users"]
    }, room=sid)
    
    # Notify other users
    await sio.emit("user_joined", {
        "username": user_data["username"],
        "users": active_rooms[room_id]["users"]
    }, room=room_id)

@sio.event
async def send_chat_message(sid, data):
    room_id = data.get("room_id")
    message = data.get("message")
    
    if sid not in connected_users:
        return
    
    user_data = connected_users[sid]
    
    chat_msg = {
        "id": str(uuid.uuid4()),
        "user_id": user_data["user_id"],
        "username": user_data["username"],
        "message": message,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Store message
    if room_id in active_rooms:
        active_rooms[room_id]["chat_messages"].append(chat_msg)
        
        # Keep only last 100 messages
        if len(active_rooms[room_id]["chat_messages"]) > 100:
            active_rooms[room_id]["chat_messages"] = active_rooms[room_id]["chat_messages"][-100:]
    
    # Broadcast to room
    await sio.emit("chat_message", chat_msg, room=room_id)

@sio.event
async def update_notes(sid, data):
    room_id = data.get("room_id")
    content = data.get("content")
    
    if room_id in active_rooms:
        active_rooms[room_id]["notes_content"] = content
        
        # Broadcast to other users in room (exclude sender)
        await sio.emit("notes_updated", {
            "content": content
        }, room=room_id, skip_sid=sid)

@sio.event
async def drawing_data(sid, data):
    room_id = data.get("room_id")
    drawing_data = data.get("data")
    
    # Broadcast drawing data to other users in room
    await sio.emit("drawing_update", {
        "data": drawing_data
    }, room=room_id, skip_sid=sid)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Combine FastAPI and Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    uvicorn.run(socket_app, host="0.0.0.0", port=8001)