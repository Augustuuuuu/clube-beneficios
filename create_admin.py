import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@exemplo.com', 'SenhaForte123')
    print("Usuário administrador criado: admin / SenhaForte123")
else:
    print("Usuário administrador já existe.")