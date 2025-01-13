from fastapi import FastAPI
from routes.auth import auth_router  # Import the auth routes
from fastapi.middleware.cors import CORSMiddleware

# Create the FastAPI app
app = FastAPI()

# Add CORS middleware to allow requests from different origins (e.g., React frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace "*" with your frontend URL for better security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the authentication routes with the /auth prefix
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

@app.get("/")
def root():
    return {"message": "API is running!"}
