import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Register = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setMessage("Passwords do not match!");
      return;
    }

    try {
      const registerResponse = await axios.post(
        "http://localhost:8000/auth/register",
        {
          username: formData.username,
          email: formData.email,
          password: formData.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const loginResponse = await axios.post(
        "http://localhost:8000/auth/login",
        {
          username_or_email: formData.email,
          password: formData.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      localStorage.setItem("token", loginResponse.data.access_token);
      setMessage("Registration successful!");

      setTimeout(() => {
        navigate("/chat");
      }, 2000);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Registration failed!");
    }
  };

  const handleBackToLogin = () => {
    navigate("/");
  };

  return (
    <div className="container">
      <h1>Register</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Username"
          value={formData.username}
          onChange={handleChange}
          className="input"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
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
          title="• At least 8 characters long\n• Must contain a number\n• Must include at least one special character (!@#$%^&*)"
        />
        <div className="password-requirements">
          <ul>
            <li>
              <h4>
                Password Requirements (make it hover for password input area)
              </h4>
            </li>
            <li>At least 8 characters long</li>
            <li>Must contain a number</li>
            <li>Must include at least one special character (!@#$%^&*)</li>
          </ul>
        </div>
        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChange={handleChange}
          className="input"
        />
        <button type="submit" className="button">
          Register
        </button>
      </form>
      <hr />
      <button onClick={handleBackToLogin} className="button back-button">
        Back to Login
      </button>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Register;
