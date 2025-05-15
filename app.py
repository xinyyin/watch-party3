import sqlite3
import string
import random
import time
from datetime import datetime
from flask import Flask, g, request, jsonify, send_from_directory, current_app
from functools import wraps

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect('db/watchparty.sqlite3')
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def query_db(query, args=(), one=False):
        db = get_db()
        cursor = db.execute(query, args)
        rows = cursor.fetchall()
        db.commit() 
        cursor.close()
        if rows:
            if one:
                return rows[0]
            return rows
        return None
    


def new_user():
    name = "Unnamed User #" + ''.join(random.choices(string.digits, k=6))
    password = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
    api_key = ''.join(random.choices(string.ascii_lowercase + string.digits, k=40))
    user_details = None 
    cursor = None 

    try:
        db = get_db()
        insert_query = 'INSERT INTO users (name, password, api_key) VALUES (?, ?, ?)'
        cursor = db.execute(insert_query, (name, password, api_key))
        db.commit() 
        user_id = cursor.lastrowid
        cursor.close()

        if user_id:
            select_query = 'SELECT id, name, password, api_key FROM users WHERE id = ?'
            user_details = query_db(select_query, (user_id,), one=True)

            if not user_details:
                 print(f"Error: Could not retrieve user details for inserted id {user_id}")

        else:
            print("Error: Could not get lastrowid after insert.")
            if cursor: cursor.close() 

    except sqlite3.Error as e:
        print(f"Database error in new_user: {e}")
        if cursor: cursor.close()
    return user_details

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print("FLASK_DEBUG: Request Headers received by Flask:", request.headers) # <--- 关键日志
        api_key = request.headers.get('Api-Key')
        print(f"FLASK_DEBUG: Extracted Api-Key header by Flask: {api_key}") # <--- 关键日志
        if api_key:
            user = query_db('SELECT * FROM users WHERE api_key = ?', (api_key,), one=True)
            if user:
                g.user = user
                return f(*args, **kwargs)

        return jsonify({"success": False, "message": "Invalid or missing API key."}), 401
    return decorated_function

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if path != "" and (path.startswith('api/') or '.' in path):
         try:
              return send_from_directory(app.static_folder, path)
         except:
              return jsonify({"error": "File not found"}), 404 
    else:
        return send_from_directory(app.static_folder, 'index.html')


@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory(app.static_folder, 'index.html'), 404 

# -------------------------------- API ROUTES ----------------------------------


@app.route('/api/signup', methods=['POST'])
def api_signup():
    user = new_user()
    if user:
        return jsonify({
            "success": True,
            "api_key": user["api_key"],
            "user_name": user["name"],
            "user_id": user["id"]
        }), 201 
    return jsonify({"success": False, "message": "User creation failed"}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    user = query_db('SELECT * FROM users WHERE name = ? AND password = ?',
                    (username, password), one=True)

    if user:
        return jsonify({
            "success": True,
            "api_key": user['api_key'],
            "user_name": user['name'],
            "user_id": user["id"]
        }), 200
    else:
        return jsonify({"success": False, "message": "Invalid username or password."}), 401

@app.route('/api/user/profile', methods=['GET'])
@require_api_key 
def api_get_user_profile():
    user = g.user
    return jsonify({
        "success": True,
        "user_id": user["id"],
        "user_name": user["name"]
    }), 200

@app.route('/api/user/name', methods=['POST']) 
@require_api_key
def api_update_username():
    user = g.user 
    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    new_name = data.get('new_name') 

    if not new_name:
        return jsonify({"success": False, "message": "New name is required."}), 400

    try:
        # Use the validated user ID from g.user
        query_db('UPDATE users SET name = ? WHERE id = ?', (new_name, user['id']))
        return jsonify({"success": True, "message": "Username updated successfully."}), 200
    except sqlite3.Error as e:
        print(f"Database error updating username: {e}")
        return jsonify({"success": False, "message": "Database error occurred."}), 500

@app.route('/api/user/password', methods=['POST']) 
@require_api_key 
def api_update_password():
    user = g.user 
    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    new_password = data.get('new_password')
    confirm_password = data.get('confirm_password') 

    if not new_password or not confirm_password:
        return jsonify({"success": False, "message": "New password and confirmation are required."}), 400

    if new_password != confirm_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    try:
        query_db('UPDATE users SET password = ? WHERE id = ?', (new_password, user['id']))
        return jsonify({"success": True, "message": "Password updated successfully."}), 200
    except sqlite3.Error as e:
        print(f"Database error updating password: {e}")
        return jsonify({"success": False, "message": "Database error occurred."}), 500

@app.route('/api/rooms', methods=['GET'])
@require_api_key 
def api_get_rooms():
    rooms = query_db('SELECT id, name FROM rooms') 
    if rooms is not None: 
        room_list = [{"id": room["id"], "name": room["name"]} for room in rooms]
        return jsonify(room_list), 200
    else:        
        check_empty = query_db('SELECT count(*) as count FROM rooms', one=True)
        if check_empty and check_empty['count'] == 0:
             return jsonify([]), 200 
        else:
             return jsonify({"success": False, "message": "Failed to retrieve rooms"}), 500


@app.route('/api/rooms', methods=['POST'])
@require_api_key 
def api_create_room():
    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    room_name = data.get('room_name') 

    if not room_name:
        room_name = "Unnamed Room " + ''.join(random.choices(string.digits, k=6))

    new_room_details = None
    cursor = None 

    try:
        db = get_db()
        insert_query = 'INSERT INTO rooms (name) VALUES (?)'
        cursor = db.execute(insert_query, [room_name])
        db.commit() 
        room_id = cursor.lastrowid
        cursor.close()

        if room_id:
            select_query = 'SELECT id, name FROM rooms WHERE id = ?'
            new_room_details = query_db(select_query, (room_id,), one=True)

            if new_room_details:
                return jsonify({"success": True, "room": dict(new_room_details)}), 201 # 201 Created
            else:
                 print(f"Error: Could not retrieve room details for inserted id {room_id}")
                 return jsonify({"success": False, "message": "Failed retrieve created room details."}), 500
        else:
             print("Error: Could not get lastrowid after room insert.")
             if cursor: cursor.close()
             return jsonify({"success": False, "message": "Failed to get ID after room creation."}), 500

    except sqlite3.IntegrityError:
         if cursor: cursor.close()
         return jsonify({"success": False, "message": f"Room name '{room_name}' might already exist."}), 409 
    except sqlite3.Error as e:
        print(f"Database error creating room: {e}")
        if cursor: 
            cursor.close()
        return jsonify({"success": False, "message": "Database error occurred."}), 500

@app.route('/api/rooms/<int:room_id>/name', methods=['POST']) 
@require_api_key 
def api_update_room_name(room_id):
    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    new_name = data.get('new_name') 
    if not new_name:
        return jsonify({"success": False, "message": "New room name ('new_name') is required."}), 400

    try:
        result = query_db('UPDATE rooms SET name = ? WHERE id = ?', (new_name, room_id))
        return jsonify({"success": True, "message": "Room name updated successfully."}), 200
    except sqlite3.IntegrityError:
        return jsonify({"success": False, "message": f"Room name '{new_name}' might already exist."}), 409
    except sqlite3.Error as e:
        print(f"Database error updating room name: {e}")
        return jsonify({"success": False, "message": "Database error occurred"}), 500


@app.route('/api/rooms/<int:room_id>/messages', methods=['GET'])
@require_api_key 
def api_get_room_messages(room_id):
    query = """
    SELECT m.id, m.body, u.name as author, m.user_id, m.room_id
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.room_id = ?
    ORDER BY m.id ASC;
    """
    messages = query_db(query, [room_id])

    if messages is not None:
        messages_list = [dict(msg) for msg in messages]
        return jsonify(messages_list), 200
    else:
        check_empty = query_db('SELECT count(*) as count FROM messages WHERE room_id = ?', [room_id], one=True)
        if check_empty and check_empty['count'] == 0:
             return jsonify([]), 200 
        else:
            return jsonify({"success": False, "message": "Failed to retrieve messages"}), 500

@app.route('/api/rooms/<int:room_id>/messages', methods=['POST']) # Changed path
@require_api_key 
def api_post_room_message(room_id):
    user = g.user 
    userid = user['id'] 

    data = request.get_json()
    if not data:
         return jsonify({"success": False, "message": "Request body must be JSON."}), 400

    message_body = data.get('body')
    if not message_body or not isinstance(message_body, str) or message_body.strip() == "":
        return jsonify({"success": False, "message": "Message body is required and cannot be empty."}), 400

    try:
        query = "INSERT INTO messages (user_id, room_id, body) VALUES (?, ?, ?)"
        query_db(query, [userid, room_id, message_body.strip()])
        return jsonify({'success': True, 'message': 'Message posted successfully'}), 201 
    except sqlite3.Error as e:
        print(f"Database error posting message: {e}")
        return jsonify({'success': False, 'message': 'Failed to post message. Ensure room exists.'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3500, debug=True)



'''
app.py:

/api/signup (POST) - api_signup
/api/login (POST) - api_login
/api/user/profile (GET) - api_get_user_profile 
/api/user/name (POST) - api_update_username
/api/user/password (POST) - api_update_password
/api/rooms (GET) - api_get_rooms
/api/rooms (POST) - api_create_room
/api/rooms/<int:room_id>/name (POST) - api_update_room_name
/api/rooms/<int:room_id>/messages (GET) - api_get_room_messages
/api/rooms/<int:room_id>/messages (POST) - api_post_room_message 
'''