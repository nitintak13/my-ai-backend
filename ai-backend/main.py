from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.match import router

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 🔒 Use specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Add a simple root route
@app.get("/")
def read_root():
    return {"status": "SmartApply AI backend is running."}

@app.get("/health")
def health_check():
    return {"status": "ok"}


# Match router
app.include_router(router, prefix="/api/match")
