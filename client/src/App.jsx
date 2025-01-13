import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./components/Login";
import Register from "./components/Register";
import Chat from "./components/Chat";

const App = () => {
  const [token, setToken] = useState("");

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login setToken={setToken} />} />
        <Route path="/register" element={<Register />} />
        <Route path="/chat" element={<Chat token={token} />} />
      </Routes>
    </Router>
  );
};

export default App;
