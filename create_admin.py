import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
username = 'admin'
email = 'admin@exemplo.com'
password = 'SuaSenhaForte123'

try:
    user, created = User.objects.get_or_create(username=username, defaults={'email': email})
    user.set_password(password)
    user.save()
    if created:
        print(f"Sucesso: Utilizador '{username}' criado.")
    else:
        print(f"Sucesso: Senha do utilizador '{username}' atualizada.")
except Exception as e:
    print(f"Erro ao criar admin: {e}")