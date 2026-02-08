"""
Children Records API Routes
"""
from flask import Blueprint, request, jsonify
import sys
import os

# Add parent directory to path to import ai module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai import save_record, get_child_history, analyze_child

bp = Blueprint('children', __name__, url_prefix='/api/children')

@bp.route('/save', methods=['POST'])
def save():
    """Save a child record"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['child_id', 'age', 'sex', 'weight', 'height']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Analyze first to get result
        result = analyze_child(
            age=int(data['age']),
            sex=data['sex'],
            weight=float(data['weight']),
            height=float(data['height'])
        )
        
        # Save record
        save_record(
            data['child_id'],
            int(data['age']),
            data['sex'],
            float(data['weight']),
            float(data['height']),
            result
        )
        
        return jsonify({
            'status': 'success',
            'message': 'Record saved successfully',
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@bp.route('/history/<child_id>', methods=['GET'])
def history(child_id):
    """Get child history"""
    try:
        history_data = get_child_history(child_id)
        
        # Convert DataFrame to dict for JSON response
        if history_data is not None and not history_data.empty:
            history_dict = history_data.to_dict('records')
            return jsonify({
                'status': 'success',
                'data': history_dict
            }), 200
        else:
            return jsonify({
                'status': 'success',
                'data': [],
                'message': 'No records found'
            }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
