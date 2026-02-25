import os
import django

# Define as configurações do Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
username = 'admin'
email = 'admin@exemplo.com'
password = 'SuaSenhaForte123'

try:
    # Procura o utilizador ou cria um novo com as permissões necessárias
    user, created = User.objects.get_or_create(
        username=username, 
        defaults={
            'email': email,
            'is_staff': True,
            'is_superuser': True
        }
    )
    
    # Garante que as permissões e a senha estejam atualizadas, mesmo que o utilizador já exista
    user.is_staff = True
    user.is_superuser = True
    user.set_password(password)
    user.save()
    
    if created:
        print(f"Sucesso: Utilizador administrador '{username}' criado com permissões totais.")
    else:
        print(f"Sucesso: Permissões e senha do administrador '{username}' foram atualizadas.")

except Exception as e:
    print(f"Erro ao configurar o administrador: {e}")