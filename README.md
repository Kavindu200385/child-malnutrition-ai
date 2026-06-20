# Child Malnutrition AI System

A full-stack web application for analyzing child malnutrition risk using AI/ML models.

## Project Structure

```
child-malnutrition-ai/
├── backend/                 # Flask Backend
│   ├── ai/                  # AI Module
│   │   ├── child_risk_analyzing.py
│   │   ├── data_processing.py
│   │   └── model_training.py
│   ├── routes/              # API Routes
│   │   ├── analysis.py
│   │   ├── children.py
│   │   └── history.py
│   ├── models/              # ML Models
│   ├── data/                # Data storage
│   ├── dataset/             # Training datasets
│   ├── app.py               # Flask application
│   └── requirements.txt
│
└── frontend/                # React Frontend
    ├── src/
    │   ├── components/      # React components
    │   ├── pages/           # Page components
    │   ├── services/        # API services
    │   └── utils/           # Utilities
    ├── package.json
    └── vite.config.js
```

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment (recommended):
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run Flask server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### Analysis
- `POST /api/analysis/analyze` - Analyze child malnutrition risk
  ```json
  {
    "age": 18,
    "sex": "M",
    "weight": 8.5,
    "height": 75
  }
  ```

### Children Records
- `POST /api/children/save` - Save child record
  ```json
  {
    "child_id": "CH001",
    "age": 18,
    "sex": "M",
    "weight": 8.5,
    "height": 75
  }
  ```

- `GET /api/children/history/<child_id>` - Get child history

### Health Check
- `GET /health` - Health check endpoint

## Features

- ✅ AI-powered malnutrition risk analysis
- ✅ WHO growth standards Z-score calculations
- ✅ Child history tracking
- ✅ RESTful API
- ✅ React frontend (ready for Figma integration)

## Clinical Logic And Production Readiness

- Current nutritional status is calculated using WHO Z-score rule-based clinical logic.
- The 2-month future predicted risk uses the existing trained AI model as an early warning tool.
- AI future prediction must not be treated as a final clinical diagnosis or a replacement for clinical judgment.
- MUAC is optional because stakeholder feedback from the Family Health Bureau indicated it is not mandatory in the intended ground-level workflow.
- Edema is optional, but if present it must trigger urgent clinical review handling.
- Before real production deployment, any trimmed or sample WHO LMS reference tables should be replaced with the full official WHO LMS tables.
- The future risk model should later be retrained using real Sri Lankan longitudinal data reviewed with FHB/MOH clinical oversight.

### Production Security Notes

- Enforce HTTPS only.
- Use production-grade key management for encryption, JWT secrets, and mail credentials.
- Keep sensitive child-related fields encrypted at rest.
- Use secure JWT and/or cookie handling appropriate for deployment.
- Replace in-memory rate limiting with Redis-backed rate limiting.
- Do not store raw child-sensitive data in logs or audit metadata.
- Maintain tested database backup and restore procedures.

## Next Steps

1. Add your Figma frontend components to `frontend/src/components/`
2. Create pages in `frontend/src/pages/`
3. Connect components to API services in `frontend/src/services/api.js`
