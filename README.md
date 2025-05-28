# AI Courtroom Simulation

AI Courtroom is an interactive legal simulation platform that leverages artificial intelligence to create realistic courtroom experiences. Users can submit legal arguments, receive AI-generated counter-arguments, and get verdicts based on advanced AI analysis.

## Features

- **Case Generation**: AI-powered generation of legal case scenarios
- **Interactive Arguments**: Submit arguments as either plaintiff or defendant
- **AI Counter-Arguments**: Receive intelligent counter-arguments from the AI
- **Verdict Generation**: Get AI-generated verdicts based on the arguments presented
- **User Authentication**: Secure login and registration system
- **Case Management**: Create, view, and manage legal cases
- **Feedback System**: Submit feedback that is stored in a MongoDB database

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
   GROQ_API_KEY=your_groq_api_key
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
    └── requirements.txt    # Python dependencies
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

<p>6. Start the server</p>

```
uvicorn app.main:app --reload
```
>>>>>>> 31951aa90ae35004dec90421259d72e0de8be742
