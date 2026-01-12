<h1 align="center" id="title">AI Courtroom</h1>

<p align="center"><img src="https://socialify.git.ci/ParthRana1023/AI-Courtroom/image?description=1&amp;language=1&amp;name=1&amp;theme=Dark" alt="project-image"></p>

<h2>🧐 Features</h2>

Here're some of the project's best features:

- **Case Generation**: AI-powered generation of legal case scenarios
- **Interactive Arguments**: Submit arguments as either plaintiff or defendant
- **AI Counter-Arguments**: Receive intelligent counter-arguments from the AI
- **Verdict Generation**: Get AI-generated verdicts based on the arguments presented
- **Case Analysis**: Comprehensive AI analysis of case strength and legal merits
- **User Authentication**: Secure login with email/password and Google OAuth
- **Profile Management**: User profiles with bento grid layout and case statistics
- **Case Management**: Create, view, archive, and manage legal cases
- **Dark/Light Mode**: Full theme support with system preference detection
- **Feedback System**: Submit feedback stored in MongoDB database
- **Cookie Consent**: GDPR-compliant cookie management

## Tech Stack

### Frontend

- **Next.js 15**: React framework for server-rendered applications
- **TypeScript**: Typed JavaScript for better development experience
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Unstyled, accessible UI components
- **GSAP & Framer Motion**: Smooth animations and transitions
- **Google OAuth**: Google authentication integration

### Backend

- **FastAPI**: Modern, fast web framework for building APIs with Python
- **Beanie ODM**: MongoDB object-document mapper for Python
- **Motor**: Asynchronous MongoDB driver
- **LangChain**: Framework for developing applications powered by language models
- **Groq**: Integration for AI model access (llama-3.3-70b)
- **JWT Authentication**: Secure user authentication with configurable expiry

### Database

- **MongoDB**: NoSQL database for storing user data, cases, and feedback

### Deployment

- **Frontend**: Vercel (automatic deploys from GitHub)
- **Backend**: Render (Docker-based deployment)

## Getting Started

### Prerequisites

- Node.js (v24 or higher)
- Python (v3.13 or higher)
- MongoDB
- Docker (optional, for containerized development)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/ParthRana1023/AI-Courtroom.git
cd AI-Courtroom

# Build and run with Docker Compose
docker compose build
docker compose up
```

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

4. Create a `.env` file in the server directory:

   ```env
   # Database
   MONGODB_URL=mongodb://localhost:27017
   MONGODB_DB_NAME=ai_courtroom

   # Authentication
   SECRET_KEY=your-secure-random-key-here
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   EXTENDED_TOKEN_EXPIRE_DAYS=7

   # AI
   GROQ_API_KEY=your_groq_api_key

   # Email (for OTP)
   email_sender=your-email-username-here
   email_username=your-email-id-here
   email_password=your-app-password-here
   smtp_server=smtp.gmail.com
   smtp_port=587

   # Google OAuth
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # Cloudinary (for profile photos)
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret

   # Rate Limiting (optional)
   CASE_GENERATION_RATE_LIMIT=5
   CASE_GENERATION_RATE_WINDOW=86400
   ARGUMENT_RATE_LIMIT=10
   ARGUMENT_RATE_WINDOW=86400

   PORT=8000
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
   pnpm install
   ```

3. Create a `.env.local` file in the client directory:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── client/                 # Frontend Next.js application
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── types/              # TypeScript type definitions
│   └── public/             # Static assets
├── server/                 # Backend FastAPI application
│   ├── app/
│   │   ├── models/         # Database models (Beanie)
│   │   ├── routes/         # API routes
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic services
│   │   └── utils/          # Utility functions
│   ├── .env                # Environment variables
│   └── requirements.txt    # Python dependencies
├── docker-compose.yaml     # Docker Compose configuration
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
