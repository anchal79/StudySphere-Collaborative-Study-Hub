import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useParams } from "react-router-dom";
import io from "socket.io-client";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();
const useAuth = () => useContext(AuthContext);

// Socket Context
const SocketContext = createContext();
const useSocket = () => useContext(SocketContext);

// Auth Provider
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));

  useEffect(() => {
    if (token) {
      try {
        const decoded = jwt_decode(token);
        if (decoded.exp * 1000 > Date.now()) {
          // Token is valid, get user info from token or make API call
          const userData = JSON.parse(localStorage.getItem("user") || "{}");
          setUser(userData);
        } else {
          // Token expired
          logout();
        }
      } catch (error) {
        logout();
      }
    }
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem("token", access_token);
      localStorage.setItem("user", JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || "Login failed" };
    }
  };

  const register = async (username, email, password) => {
    try {
      const response = await axios.post(`${API}/auth/register`, { username, email, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem("token", access_token);
      localStorage.setItem("user", JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || "Registration failed" };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
};

// Socket Provider
const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const newSocket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
      });
      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

// Components
const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <nav className="bg-gray-900 text-white p-4 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/dashboard" className="text-2xl font-bold text-blue-400">
          StudySphere
        </Link>
        {user && (
          <div className="flex items-center space-x-4">
            <span className="text-gray-300">Welcome, {user.username}!</span>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let result;
      if (isRegistering) {
        result = await register(username, email, password);
      } else {
        result = await login(email, password);
      }

      if (result.success) {
        navigate("/dashboard");
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">StudySphere</h1>
          <p className="text-gray-600 mt-2">Collaborative Study Hub</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isRegistering && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Please wait..." : (isRegistering ? "Sign Up" : "Sign In")}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API}/rooms/my-rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRooms(response.data);
    } catch (error) {
      console.error("Failed to fetch rooms:", error);
    }
  };

  const createRoom = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/rooms/create`, 
        { name: roomName },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setRooms([...rooms, response.data]);
      setRoomName("");
      setShowCreateRoom(false);
      navigate(`/room/${response.data.id}`);
    } catch (error) {
      console.error("Failed to create room:", error);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/rooms/join`,
        { room_code: roomCode },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setRooms([...rooms, response.data]);
      setRoomCode("");
      setShowJoinRoom(false);
      navigate(`/room/${response.data.id}`);
    } catch (error) {
      console.error("Failed to join room:", error.response?.data?.detail || "Failed to join room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Your Study Rooms</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => setShowCreateRoom(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Room
            </button>
            <button
              onClick={() => setShowJoinRoom(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Join Room
            </button>
          </div>
        </div>

        {/* Create Room Modal */}
        {showCreateRoom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Create New Room</h2>
              <form onSubmit={createRoom}>
                <input
                  type="text"
                  placeholder="Room Name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg mb-4 focus:ring-2 focus:ring-blue-500"
                  required
                />
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateRoom(false)}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Room Modal */}
        {showJoinRoom && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Join Room</h2>
              <form onSubmit={joinRoom}>
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border rounded-lg mb-4 focus:ring-2 focus:ring-green-500"
                  required
                />
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? "Joining..." : "Join"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoinRoom(false)}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rooms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{room.name}</h3>
              <p className="text-gray-600 text-sm mb-4">Code: {room.room_code}</p>
              <p className="text-gray-500 text-xs mb-4">
                {room.participants.length} participant(s)
              </p>
              <button
                onClick={() => navigate(`/room/${room.id}`)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors"
              >
                Enter Room
              </button>
            </div>
          ))}
        </div>

        {rooms.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No rooms yet. Create or join a room to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
};

const StudyRoom = ({ roomId }) => {
  const [activeTab, setActiveTab] = useState("notes");
  const [notes, setNotes] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [room, setRoom] = useState(null);
  const socket = useSocket();
  const { user, token } = useAuth();
  const canvasRef = React.useRef(null);
  const [isDrawing, setIsDrawing] = React.useState(false);

  useEffect(() => {
    if (socket && user && roomId) {
      // Join the room
      socket.emit("join_room", {
        room_id: roomId,
        user: user
      });

      // Listen for room state
      socket.on("room_state", (data) => {
        setNotes(data.notes_content);
        setChatMessages(data.chat_messages);
        setConnectedUsers(data.users);
      });

      // Listen for new chat messages
      socket.on("chat_message", (message) => {
        setChatMessages(prev => [...prev, message]);
      });

      // Listen for notes updates
      socket.on("notes_updated", (data) => {
        setNotes(data.content);
      });

      // Listen for user events
      socket.on("user_joined", (data) => {
        setConnectedUsers(data.users);
      });

      socket.on("user_left", (data) => {
        setConnectedUsers(data.users);
      });

      // Listen for drawing updates
      socket.on("drawing_update", (data) => {
        // Redraw on canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          const drawData = data.data;
          ctx.strokeStyle = drawData.color;
          ctx.lineWidth = drawData.width;
          ctx.lineTo(drawData.x, drawData.y);
          ctx.stroke();
        }
      });

      return () => {
        socket.off("room_state");
        socket.off("chat_message");
        socket.off("notes_updated");
        socket.off("user_joined");
        socket.off("user_left");
        socket.off("drawing_update");
      };
    }
  }, [socket, user, roomId]);

  const handleNotesChange = (content) => {
    setNotes(content);
    if (socket) {
      socket.emit("update_notes", {
        room_id: roomId,
        content: content
      });
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit("send_chat_message", {
        room_id: roomId,
        message: newMessage.trim()
      });
      setNewMessage("");
    }
  };

  // Whiteboard functionality
  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // Emit drawing data
    if (socket) {
      socket.emit("drawing_data", {
        room_id: roomId,
        data: { x, y, color: "#000", width: 2 }
      });
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg">
          {/* Header */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-800">Study Room</h1>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {connectedUsers.length} user(s) online
                </span>
                <div className="flex -space-x-2">
                  {connectedUsers.slice(0, 5).map((user, index) => (
                    <div
                      key={user.socket_id}
                      className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                      title={user.username}
                    >
                      {user.username[0].toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {["notes", "chat", "whiteboard"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === "notes" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Collaborative Notes</h2>
                <ReactQuill
                  theme="snow"
                  value={notes}
                  onChange={handleNotesChange}
                  style={{ height: "400px", marginBottom: "50px" }}
                />
              </div>
            )}

            {activeTab === "chat" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Group Chat</h2>
                <div className="border rounded-lg">
                  <div className="h-96 overflow-y-auto p-4 bg-gray-50">
                    {chatMessages.map((msg, index) => (
                      <div key={index} className="mb-3">
                        <span className="font-medium text-blue-600">{msg.username}: </span>
                        <span className="text-gray-800">{msg.message}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} className="border-t p-4">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                      >
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === "whiteboard" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Collaborative Whiteboard</h2>
                <div className="border rounded-lg p-4 bg-white">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={500}
                    className="border border-gray-300 cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StudyRoomWrapper = () => {
  const { roomId } = useParams();
  return <StudyRoom roomId={roomId} />;
};

const PrivateRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/" />;
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <div className="App">
            <Routes>
              <Route path="/" element={<Login />} />
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/room/:roomId"
                element={
                  <PrivateRoute>
                    <StudyRoomWrapper />
                  </PrivateRoute>
                }
              />
            </Routes>
          </div>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;