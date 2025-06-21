<h1 align="center" id="title">AI Courtroom</h1>

<p align="center"><img src="https://socialify.git.ci/ParthRana1023/AI-Courtroom/image?description=1&amp;language=1&amp;name=1&amp;theme=Dark" alt="project-image"></p>

  
  
<h2>🧐 Features</h2>

Here're some of the project's best features:

*   Case Generation: AI-powered generation of legal case scenarios
*   Interactive Arguments: Submit arguments as either plaintiff or defendant
*   AI Counter-Arguments: Receive intelligent counter-arguments from the AI
*   Verdict Generation: Get AI-generated verdicts based on the arguments presented
*   User Authentication: Secure login and registration system
*   Case Management: Create view and manage legal cases
*   Feedback System: Submit feedback that is stored in a MongoDB database

## Tech Stack

### Frontend

- **Next.js**: React framework for server-rendered applications
- **TypeScript**: Typed JavaScript for better development experience
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Unstyled, accessible UI components
- **Axios**: Promise-based HTTP client

### Backend

- **FastAPI**: Modern, fast web framework for building APIs with Python
- **Beanie ODM**: MongoDB object-document mapper for Python
- **Motor**: Asynchronous MongoDB driver
- **LangChain**: Framework for developing applications powered by language models
- **Groq**: Integration for AI model access
- **JWT Authentication**: Secure user authentication

### Database

- **MongoDB**: NoSQL database for storing user data, cases, and feedback

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python (v3.9 or higher)
- MongoDB

### Backend Setup

1. Navigate to the server directory:

   ```bash
   cd server
   ```

2. Create a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the server directory with the following variables:

   ```
   MONGODB_URL=mongodb://localhost:27017
   MONGODB_DB_NAME=ai_courtroom
   SECRET_KEY=your_secret_key
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ALGORITHM=HS256 
   ACCESS_TOKEN_EXPIRE_MINUTES=30 
   PORT=8000

   GROQ_API_KEY=your_groq_api_key
   
   email_sender=your-email-username-here 
   email_username=your-email-id-here 
   email_password=your-app-password-here 
   smtp_server=smtp.gmail.com 
   smtp_port=587  
   ```

5. Start the backend server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend Setup

1. Navigate to the client directory:

   ```bash
   cd client
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file in the client directory with the following variables:

   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Project Structure

```
├── client/                 # Frontend Next.js application
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   └── public/             # Static assets
└── server/                 # Backend FastAPI application
    ├── app/                # Main application package
    │   ├── models/         # Database models
    │   ├── routes/         # API routes
    │   ├── schemas/        # Pydantic schemas
    │   ├── services/       # Business logic services
    │   └── utils/          # Utility functions
    ├── .env                # Environament variables file
    └── requirements.txt    # Python dependencies
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
