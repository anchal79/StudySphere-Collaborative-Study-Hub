#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import time
import uuid

class StudySphereAPITester:
    def __init__(self, base_url="https://c7fb25b5-8682-4173-aaa5-b56bd9439b0b.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.room_id = None
        self.room_code = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def make_request(self, method, endpoint, data=None, auth_required=True):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {str(e)}")
            return None

    def test_user_registration(self):
        """Test user registration"""
        test_id = str(uuid.uuid4())[:8]
        user_data = {
            "username": f"testuser_{test_id}",
            "email": f"test_{test_id}@example.com",
            "password": "TestPassword123!"
        }
        
        response = self.make_request('POST', 'auth/register', user_data, auth_required=False)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data and 'user' in data:
                self.token = data['access_token']
                self.user_data = data['user']
                return self.log_test("User Registration", True, f"- User: {self.user_data['username']}")
            else:
                return self.log_test("User Registration", False, "- Missing token or user data")
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else 'No response'
            return self.log_test("User Registration", False, f"- Status: {response.status_code if response else 'None'}, Error: {error_msg}")

    def test_user_login(self):
        """Test user login with existing credentials"""
        if not self.user_data:
            return self.log_test("User Login", False, "- No user data from registration")
        
        # Create a new user for login test
        test_id = str(uuid.uuid4())[:8]
        register_data = {
            "username": f"loginuser_{test_id}",
            "email": f"login_{test_id}@example.com", 
            "password": "LoginTest123!"
        }
        
        # Register first
        reg_response = self.make_request('POST', 'auth/register', register_data, auth_required=False)
        if not reg_response or reg_response.status_code != 200:
            return self.log_test("User Login", False, "- Failed to create test user for login")
        
        # Now test login
        login_data = {
            "email": register_data["email"],
            "password": register_data["password"]
        }
        
        response = self.make_request('POST', 'auth/login', login_data, auth_required=False)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data and 'user' in data:
                return self.log_test("User Login", True, f"- User: {data['user']['username']}")
            else:
                return self.log_test("User Login", False, "- Missing token or user data")
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else 'No response'
            return self.log_test("User Login", False, f"- Status: {response.status_code if response else 'None'}, Error: {error_msg}")

    def test_create_room(self):
        """Test room creation"""
        if not self.token:
            return self.log_test("Create Room", False, "- No authentication token")
        
        room_data = {
            "name": f"Test Room {datetime.now().strftime('%H:%M:%S')}"
        }
        
        response = self.make_request('POST', 'rooms/create', room_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'id' in data and 'room_code' in data and 'name' in data:
                self.room_id = data['id']
                self.room_code = data['room_code']
                return self.log_test("Create Room", True, f"- Room: {data['name']}, Code: {data['room_code']}")
            else:
                return self.log_test("Create Room", False, "- Missing room data")
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else 'No response'
            return self.log_test("Create Room", False, f"- Status: {response.status_code if response else 'None'}, Error: {error_msg}")

    def test_join_room(self):
        """Test joining a room by code"""
        if not self.token or not self.room_code:
            return self.log_test("Join Room", False, "- No token or room code available")
        
        join_data = {
            "room_code": self.room_code
        }
        
        response = self.make_request('POST', 'rooms/join', join_data)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'id' in data and 'room_code' in data:
                return self.log_test("Join Room", True, f"- Joined room: {data['room_code']}")
            else:
                return self.log_test("Join Room", False, "- Missing room data")
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else 'No response'
            return self.log_test("Join Room", False, f"- Status: {response.status_code if response else 'None'}, Error: {error_msg}")

    def test_get_my_rooms(self):
        """Test getting user's rooms"""
        if not self.token:
            return self.log_test("Get My Rooms", False, "- No authentication token")
        
        response = self.make_request('GET', 'rooms/my-rooms')
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                return self.log_test("Get My Rooms", True, f"- Found {len(data)} room(s)")
            else:
                return self.log_test("Get My Rooms", False, "- Response is not a list")
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else 'No response'
            return self.log_test("Get My Rooms", False, f"- Status: {response.status_code if response else 'None'}, Error: {error_msg}")

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        invalid_data = {
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        }
        
        response = self.make_request('POST', 'auth/login', invalid_data, auth_required=False)
        
        if response and response.status_code == 401:
            return self.log_test("Invalid Login", True, "- Correctly rejected invalid credentials")
        else:
            return self.log_test("Invalid Login", False, f"- Expected 401, got {response.status_code if response else 'None'}")

    def test_unauthorized_access(self):
        """Test accessing protected endpoints without token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        response = self.make_request('GET', 'rooms/my-rooms')
        
        # Restore token
        self.token = original_token
        
        if response and response.status_code == 403:
            return self.log_test("Unauthorized Access", True, "- Correctly rejected unauthorized request")
        else:
            return self.log_test("Unauthorized Access", False, f"- Expected 403, got {response.status_code if response else 'None'}")

    def test_duplicate_registration(self):
        """Test registering with existing email"""
        if not self.user_data:
            return self.log_test("Duplicate Registration", False, "- No user data available")
        
        duplicate_data = {
            "username": "newusername",
            "email": self.user_data['email'],  # Use existing email
            "password": "NewPassword123!"
        }
        
        response = self.make_request('POST', 'auth/register', duplicate_data, auth_required=False)
        
        if response and response.status_code == 400:
            return self.log_test("Duplicate Registration", True, "- Correctly rejected duplicate email")
        else:
            return self.log_test("Duplicate Registration", False, f"- Expected 400, got {response.status_code if response else 'None'}")

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting StudySphere API Tests")
        print("=" * 50)
        
        # Core functionality tests
        self.test_user_registration()
        self.test_user_login()
        self.test_create_room()
        self.test_join_room()
        self.test_get_my_rooms()
        
        # Error handling tests
        self.test_invalid_login()
        self.test_unauthorized_access()
        self.test_duplicate_registration()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} test(s) failed")
            return 1

def main():
    """Main test runner"""
    print("StudySphere Backend API Testing")
    print("Testing against: https://c7fb25b5-8682-4173-aaa5-b56bd9439b0b.preview.emergentagent.com/api")
    print()
    
    tester = StudySphereAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())