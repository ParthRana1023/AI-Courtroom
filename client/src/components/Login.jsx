import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const Login = ({ setToken }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const navigate = useNavigate(); // For navigation

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        "http://localhost:8000/auth/login",
        {
          username_or_email: formData.username_or_email, // Accepts username or email
          password: formData.password,
        },
        {
          headers: { "Content-Type": "application/json" }, // Set correct headers
        }
      );
      setToken(response.data.access_token); // Save the token
      setMessage("Login successful!");
      navigate("/chat"); // Navigate to the Chat page
    } catch (error) {
      setMessage(error.response?.data?.detail || "Login failed!");
    }
  };

  const handleRegister = () => {
    navigate("/register"); // Navigate to the Register page
  };

  return (
    <div className="container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username_or_email"
          placeholder="Username or Email"
          value={formData.username_or_email}
          onChange={handleChange}
          className="input"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          className="input"
        />
        <button type="submit" className="button">
          Login
        </button>
      </form>
      {message && <p>{message}</p>}
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <p>Don't have an account?</p>
        <button onClick={handleRegister} className="button">
          Register
        </button>
      </div>
    </div>
  );
};

export default Login;
