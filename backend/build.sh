#!/usr/bin/env bash
set -e
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
python manage.py shell -c "
from api.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create(username='admin', password='admin', role='admin', status='Active')
    print('Admin created')
"