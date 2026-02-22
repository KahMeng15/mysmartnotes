"""Reset password for test user"""
from app.models.db import User
from app.utils.db import SessionLocal
from app.utils.auth import hash_password

# Reset the test user's password
db = SessionLocal()

try:
    user = db.query(User).filter(User.email == 'test@example.com').first()

    if user:
        # Set a simple password
        user.hashed_password = hash_password('password')
        db.commit()
        print('✅ Password reset for test@example.com to: password')
        print('   You can now login with:')
        print('   Email: test@example.com')
        print('   Password: password')
    else:
        print('❌ User test@example.com not found')
        print('   Creating new user...')
        
        # Create the test user
        new_user = User(
            username='test@example.com',
            email='test@example.com',
            full_name='Test User',
            nickname='Tester',
            hashed_password=hash_password('password')
        )
        db.add(new_user)
        db.commit()
        print('✅ Created test@example.com with password: password')
        
except Exception as e:
    print(f'❌ Error: {e}')
    db.rollback()
finally:
    db.close()
