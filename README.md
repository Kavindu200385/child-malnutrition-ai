# Child Malnutrition Monitoring System

Full-stack application for recording child growth measurements, applying WHO growth standards, and supporting clinical follow-up workflows.

## Assessment

The system calculates weight-for-age, height-for-age, and weight-for-height Z-scores using WHO reference data. Current nutritional status is determined from these scores together with MUAC and edema observations.

## Development

```sh
pip install -r backend/requirements.txt
cd frontend && npm install && npm run dev
```

The Flask service provides a health endpoint at `/health`.
