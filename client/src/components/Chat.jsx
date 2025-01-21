import React, { useState, useEffect } from "react";
import axios from "axios";

const REACT_APP_API_URL = "http://localhost:8000";

const Chat = ({ token }) => {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchChatHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/chat/get_chat_history` |
          "http://localhost:8000/chat/get_chat_history",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setHistory(response.data.chat_history);
    } catch (error) {
      if (error.response?.status === 401) {
        alert("Session expired. Please log in again.");
        localStorage.removeItem("token");
        window.location.href = "/";
      } else {
        setError("Failed to fetch chat history.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/chat/save_chat`,
        {
          user_id: "123", // Replace with actual user_id
          message,
          response: "AI response",
          timestamp: new Date().toISOString(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setHistory([...history, { message, response: "AI response" }]);
      setMessage("");
    } catch (error) {
      setError("Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChatHistory();
  }, []);

  return (
    <div className="container">
      <h1>Chat</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      <div className="chat-history">
        {history.map((chat, index) => (
          <div key={index}>
            <p>
              <strong>User:</strong> {chat.message}
            </p>
            <p>
              <strong>AI:</strong> {chat.response}
            </p>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="input"
        />
        <button onClick={sendMessage} className="button">
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;
