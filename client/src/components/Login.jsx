import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const Login = ({ setToken }) => {
  const [formData, setFormData] = useState({
    username_or_email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

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
          username_or_email: formData.username_or_email,
          password: formData.password,
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      setToken(response.data.access_token);
      localStorage.setItem("token", response.data.access_token);
      setMessage("Login successful!");
      navigate("/chat");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Login failed!");
    }
  };

  const handleRegister = () => {
    navigate("/register");
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
