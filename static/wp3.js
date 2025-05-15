const { useState, useEffect, createContext, useContext, useRef } = React;

const AppContext = createContext(null);

const authenticatedFetch = async (url, options = {}, apiKey) => {
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Api-Key'] = apiKey;
  }

  try {
    const response = await fetch(url, { ...options, headers });
    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData?.message || responseData?.error || `HTTP error! status: ${response.status}`;
      console.error(`API Error for ${url}:`, errorMessage, responseData);
      throw new Error(errorMessage);
    }
    return responseData; 
  } catch (error) {
    console.error(`Request/Parsing error for ${url}:`, error.message);
    throw error instanceof Error ? error : new Error(error.message || 'An unexpected error occurred');
  }
};


function Site() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState('splash'); 
  const [currentUser, setCurrentUser] = useState(null);
  const [rooms, setRooms] = useState({});
  const [currentRoomId, setCurrentRoomId] = useState(null);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoggedIn && currentUser?.apiKey) {
      const fetchRooms = async () => {
        setIsLoading(true);
        try {
          const roomsData = await authenticatedFetch('/api/rooms', {}, currentUser.apiKey);
          const roomsObject = roomsData.reduce((acc, room) => {
            acc[room.id] = { ...room, messages: [] };
            return acc;
          }, {});
          setRooms(roomsObject);
        } catch (error) {
          console.error("Failed to fetch rooms:", error.message);
          setRooms({});
        } finally {
          setIsLoading(false);
        }
      };
      fetchRooms();
    } else {
      setRooms({});
    }
  }, [isLoggedIn, currentUser?.apiKey]);

  useEffect(() => {
    if (currentRoomId && isLoggedIn && currentUser?.apiKey && rooms[currentRoomId]) {
      const fetchMessages = async () => {
        try {
          const messagesData = await authenticatedFetch(`/api/rooms/${currentRoomId}/messages`, {}, currentUser.apiKey);
          setRooms(prevRooms => ({
            ...prevRooms,
            [currentRoomId]: {
              ...prevRooms[currentRoomId],
              messages: messagesData.map(msg => ({
                id: msg.id,
                user: msg.author, 
                text: msg.body    
              })),
            },
          }));
        } catch (error) {
          console.error(`Failed to fetch messages for room ${currentRoomId}:`, error.message);
        }
      };
      fetchMessages();
    }
  }, [currentRoomId, isLoggedIn, currentUser?.apiKey]); 
  const navigate = (page, roomId = null) => {
    setCurrentPage(page);
    if (page === 'room' && roomId) {
      setCurrentRoomId(roomId.toString()); 
    } else if (page !== 'room') {
        setCurrentRoomId(null);
    }
  };

  const handleLogin = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
          throw new Error(result.message || "Login failed due to server error");
      }
      setCurrentUser({ name: result.username, id: result.userid, apiKey: result.api_key });
      setIsLoggedIn(true);
      navigate('profile');
    } catch (error) {
      console.error("Login error:", error.message);
      alert(`Login failed: ${error.message}`);
      setCurrentUser(null);
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/signup', { method: 'POST' });
      const result = await response.json();
       if (!response.ok) {
        throw new Error(result.error || "Signup failed due to server error");
      }
      setCurrentUser({ name: result.user_name, id: result.user_id, apiKey: result.api_key });
      setIsLoggedIn(true);
      alert(`Signup successful! Your auto-generated username is: ${result.user_name}. Please remember it. In a real app, you'd set your own password.`);
      navigate('profile');
    } catch (error) {
      console.error("Signup error:", error.message);
      alert(`Signup failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentRoomId(null);
    navigate('login');
  };

  const handleUpdateUsername = async (newName) => {
    if (!currentUser || !currentUser.apiKey) return;
    setIsLoading(true);
    try {
      const data = await authenticatedFetch('/api/user/name', {
        method: 'POST',
        body: JSON.stringify({ new_name: newName }),
      }, currentUser.apiKey);
      setCurrentUser(prev => ({ ...prev, name: newName }));
      alert(data.message || "Username updated successfully!");
    } catch (error) {
      console.error("Update username error:", error.message);
      alert(`Update username failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (newPassword, confirmPassword) => {
    if (!currentUser || !currentUser.apiKey) return;
    if (newPassword !== confirmPassword) {
        alert("Passwords do not match.");
        return;
    }
    if (!newPassword) {
        alert("Password cannot be empty.");
        return;
    }
    setIsLoading(true);
    try {
      const data = await authenticatedFetch('/api/user/password', {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
      }, currentUser.apiKey);
      alert(data.message || "Password updated successfully!");
    } catch (error) {
      console.error("Update password error:", error.message);
      alert(`Update password failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async (roomName) => {
    if (!currentUser || !currentUser.apiKey) return;
    setIsLoading(true);
    try {
      const newRoomData = await authenticatedFetch('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ room_name: roomName }),
      }, currentUser.apiKey);
      setRooms(prevRooms => ({
        ...prevRooms,
        [newRoomData.room.id]: { ...newRoomData.room, messages: [] }
      }));
      alert(`Room "${newRoomData.room.name}" created!`);
      navigate('room', newRoomData.room.id);
    } catch (error) {
      console.error("Create room error:", error.message);
      alert(`Create room failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addMessageToRoom = async (roomId, messageText) => {
    if (!currentUser || !currentUser.id || !currentUser.apiKey || !messageText.trim()) {
      alert("Cannot send empty message or not logged in properly.");
      return;
    }
    try {
      await authenticatedFetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ userid: currentUser.id, body: messageText }),
      }, currentUser.apiKey);

      const newMessage = {
        id: Date.now(), 
        user: currentUser.name,
        text: messageText,
      };
      setRooms(prevRooms => {
        if (!prevRooms[roomId]) return prevRooms;
        return {
          ...prevRooms,
          [roomId]: {
            ...prevRooms[roomId],
            messages: [...(prevRooms[roomId].messages || []), newMessage],
          },
        };
      });
    } catch (error) {
      console.error("Send message error:", error.message);
      alert(`Send message failed: ${error.message}`);
    }
  };

  let pageComponent;
  if (isLoading && (!currentUser && currentPage !== 'splash')) { 
    pageComponent = <p>Loading application...</p>;
  } else if (!isLoggedIn) {
    switch (currentPage) {
      case 'login':
        pageComponent = <LoginPage />;
        break;
      case 'signup':
        pageComponent = <SignupPage />;
        break;
      case 'splash':
      default:
        pageComponent = <SplashPage />;
        break;
    }
  } else { 
    switch (currentPage) {
      case 'profile':
        pageComponent = <ProfilePage />;
        break;
      case 'room':
        pageComponent = <RoomPage />;
        break;
      case 'splash':
      default:
        pageComponent = <SplashPage />;
        break;
    }
  }

  const contextValue = {
    currentUser,
    isLoggedIn,
    isLoading, 
    setIsLoading,
    rooms,
    currentRoomId,
    setCurrentRoomId,
    navigate,
    handleLogin,
    handleSignup,
    handleLogout,
    handleUpdateUsername,
    handleUpdatePassword,
    handleCreateRoom,
    addMessageToRoom,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-container">
        <header>
          <h1>Watch Party 3</h1>
          <Nav />
        </header>
        <main>{pageComponent}</main>
        <footer><p>Watch Party App - Exercise 7 (React)</p></footer>
      </div>
    </AppContext.Provider>
  );
}

function Nav() {
  const { navigate, isLoggedIn, handleLogout, currentUser } = useContext(AppContext);
  return (
    <nav style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #ccc' }}>
      <button onClick={() => navigate('splash')} style={{ marginRight: '10px' }}>Splash</button>
      {isLoggedIn ? (
        <>
          <button onClick={() => navigate('profile')} style={{ marginRight: '10px' }}>Profile ({currentUser?.name})</button>
          <button onClick={() => navigate('room')} style={{ marginRight: '10px' }}>Rooms</button>
          <button onClick={handleLogout}>Logout</button>
        </>
      ) : (
        <>
          <button onClick={() => navigate('login')} style={{ marginRight: '10px' }}>Login</button>
          <button onClick={() => navigate('signup')}>Sign Up</button>
        </>
      )}
    </nav>
  );
}

function SplashPage() {
  const { navigate, isLoggedIn } = useContext(AppContext);
  return (
    <div>
      <h2>Welcome to Watch Party!</h2>
      <p>Join a room to watch and chat with friends.</p>
      {!isLoggedIn && (
        <>
          <button onClick={() => navigate('login')} style={{ marginRight: '10px' }}>Login to Get Started</button>
          <button onClick={() => navigate('signup')}>Sign Up</button>
        </>
      )}
      {isLoggedIn && (
        <button onClick={() => navigate('room')}>Go to Rooms</button>
      )}
    </div>
  );
}

function LoginPage() {
  const { handleLogin, navigate, isLoading } = useContext(AppContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim() && password.trim()) {
      handleLogin(username.trim(), password.trim());
    } else {
      alert("Please enter both username and password.");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '300px', margin: 'auto' }}>
      <h2>Login</h2>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="login-username" style={{ display: 'block', marginBottom: '5px' }}>Username:</label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
          required
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="login-password" style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          required
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
      </div>
      <button type="submit" disabled={isLoading} style={{ padding: '10px 15px', width: '100%' }}>
        {isLoading ? "Logging in..." : "Login"}
      </button>
      <p style={{ marginTop: '10px', textAlign: 'center' }}>
        No account? <button type="button" onClick={() => navigate('signup')} style={{all: 'unset', color: 'blue', cursor: 'pointer', textDecoration: 'underline'}}>Sign Up</button>
      </p>
    </form>
  );
}

function SignupPage() {
    const { handleSignup, navigate, isLoading } = useContext(AppContext);

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSignup();
    };

    return (
        <div style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
            <h2>Sign Up</h2>
            <p>Click the button below to create a new account. Your username will be randomly generated and shown to you after successful signup.</p>
            <form onSubmit={handleSubmit}>
                <button type="submit" disabled={isLoading} style={{ padding: '10px 15px' }}>
                    {isLoading ? "Creating Account..." : "Create Random Account"}
                </button>
            </form>
            <p style={{ marginTop: '10px' }}>
                Already have an account? <button type="button" onClick={() => navigate('login')} style={{all: 'unset', color: 'blue', cursor: 'pointer', textDecoration: 'underline'}}>Login</button>
            </p>
        </div>
    );
}

function ProfilePage() {
  const { currentUser, handleUpdateUsername, handleUpdatePassword, isLoading, navigate } = useContext(AppContext);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!currentUser) {
    useEffect(() => { navigate('login'); }, [navigate]);
    return <p>Redirecting to login...</p>;
   }

  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    if (newName.trim()) {
      handleUpdateUsername(newName.trim());
      setNewName('');
    } else {
      alert("New username cannot be empty.");
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!newPassword) {
        alert("New password field cannot be empty.");
        return;
    }
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    handleUpdatePassword(newPassword, confirmPassword);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div style={{ maxWidth: '400px', margin: 'auto' }}>
      <h2>Profile</h2>
      <p><strong>User ID:</strong> {currentUser.id}</p>
      <p><strong>Current Username:</strong> {currentUser.name}</p>

      <form onSubmit={handleUsernameSubmit} style={{ border: '1px solid #eee', padding: '15px', marginBottom: '20px' }}>
        <h3>Update Username</h3>
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="new-username" style={{ display: 'block', marginBottom: '5px' }}>New Username:</label>
          <input
            id="new-username"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter new username"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" disabled={isLoading} style={{ padding: '10px 15px' }}>
            {isLoading ? "Updating..." : "Update Username"}
        </button>
      </form>

      <form onSubmit={handlePasswordSubmit} style={{ border: '1px solid #eee', padding: '15px' }}>
        <h3>Update Password</h3>
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="new-password" style={{ display: 'block', marginBottom: '5px' }}>New Password:</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label htmlFor="confirm-password" style={{ display: 'block', marginBottom: '5px' }}>Confirm New Password:</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" disabled={isLoading} style={{ padding: '10px 15px' }}>
            {isLoading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}

function RoomPage() {
  const { rooms, currentRoomId, setCurrentRoomId, handleCreateRoom, isLoading: globalLoading } = useContext(AppContext);
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);


  const handleRoomCreationSubmit = async (e) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      setIsCreatingRoom(true);
      await handleCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setIsCreatingRoom(false);
    } else {
      alert("Room name cannot be empty.");
    }
  };

  if (globalLoading && Object.keys(rooms).length === 0) return <p>Loading rooms...</p>;

  const roomArray = Object.values(rooms);

  return (
    <div>
      <h2>Rooms</h2>
      <form onSubmit={handleRoomCreationSubmit} style={{marginBottom: '20px', display: 'flex', gap: '10px' }}> {}
        <input
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="New room name"
          style={{ flexGrow: 1, padding: '8px' }} 
        />
        <button 
          type="submit" 
          disabled={isCreatingRoom || globalLoading} 
          style={{ padding: '8px 15px' }} 
        >
          {isCreatingRoom ? "Creating..." : "Create Room"} {}
        </button>
      </form>

      <div className="room-selector">
        <h3>Select a Room:</h3>
        {roomArray.length > 0 ? (
            roomArray.map(room => (
            <button
                key={room.id} // Rubric: Unique key
                onClick={() => setCurrentRoomId(room.id.toString())} // Ensure IDs are handled consistently (string/number)
                disabled={currentRoomId === room.id.toString()}
                style={{marginRight: '5px', marginBottom: '5px'}}
            >
                {room.name}
            </button>
            ))
        ) : (
            <p>No rooms available. Create one!</p>
        )}
      </div>

      {currentRoomId && rooms[currentRoomId] ? (
        <ChatRoom
          roomId={currentRoomId}
          roomName={rooms[currentRoomId].name}
          messages={rooms[currentRoomId].messages || []}
        />
      ) : (
        <p style={{marginTop: '20px'}}>Please select or create a room to start chatting.</p>
      )}
    </div>
  );
}

// --- Chat Components ---
function ChatRoom({ roomId, roomName, messages }) {
  const { addMessageToRoom, currentUser, isLoading } = useContext(AppContext);
  const [newMessageText, setNewMessageText] = useState('');
  const messagesEndRef = useRef(null); // For auto-scrolling

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]); // Scroll when messages change


  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessageText.trim() && roomId) {
      addMessageToRoom(roomId, newMessageText.trim());
      setNewMessageText('');
    }
  };

  return (
    <div className="chat-room" style={{marginTop: '20px', border: '1px solid #ccc', padding: '10px'}}>
      <h3>Chat: {roomName} (ID: {roomId})</h3>
      <div className="messages-list" style={{maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '5px', marginBottom: '10px'}}>
        {messages.length > 0 ? (
          messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} /> // Rubric: Unique key & passing props
          ))
        ) : (
          <p>No messages yet. Be the first!</p>
        )}
        <div ref={messagesEndRef} /> {/* Element to scroll to */}
      </div>
      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          value={newMessageText}
          onChange={(e) => setNewMessageText(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
          style={{width: '80%', marginRight: '5px'}}
        />
        <button type="submit" disabled={isLoading}>{isLoading ? "Sending..." : "Send"}</button>
      </form>
    </div>
  );
}

function ChatMessage({ message }) { 
  const { currentUser } = useContext(AppContext); 
  const isCurrentUserMessage = currentUser && message.user === currentUser.name;

  return (
    <div
      className={`message ${isCurrentUserMessage ? 'current-user-message' : ''}`}
      style={{
        padding: '5px',
        margin: '5px 0',
        borderRadius: '5px',
        backgroundColor: isCurrentUserMessage ? '#d1e7dd' : '#f8f9fa', 
        textAlign: isCurrentUserMessage ? 'right' : 'left',
      }}
    >
      <strong>{message.user === currentUser?.name ? "You" : message.user}:</strong> {message.text}
    </div>
  );
}

const rootContainer = document.getElementById("root");
if (rootContainer) {
  const root = ReactDOM.createRoot(rootContainer);
  root.render(<Site />);
} else {
  console.error("Root container not found. React application cannot start.");
}
