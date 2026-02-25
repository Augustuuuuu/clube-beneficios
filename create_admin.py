import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
username = 'admin'
email = 'admin@exemplo.com'
password = 'SuaSenhaForte123' # Verifique se digitou esta exatamente assim

user, created = User.objects.get_or_create(username=username, defaults={'email': email})

if created:
    user.set_password(password)
    user.save()
    print(f"Usuário {username} criado com sucesso!")
else:
    user.set_password(password) # Força a atualização da senha se ele já existir
    user.save()
    print(f"Usuário {username} já existia, senha atualizada!")