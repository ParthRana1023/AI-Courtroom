import React, { useState, useEffect } from "react";
import axios from "axios";

const Chat = ({ token }) => {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);

  const fetchChatHistory = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/chat/get_chat_history",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setHistory(response.data.chat_history);
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };

  const sendMessage = async () => {
    try {
      const response = await axios.post(
        "http://localhost:8000/chat/save_chat",
        {
          user_id: "123",
          message,
          response: "AI response",
          timestamp: new Date().toISOString(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setHistory([...history, { message, response: "AI response" }]);
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  useEffect(() => {
    fetchChatHistory();
  }, []);

  return (
    <div className="container">
      <h1>Chat</h1>
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
