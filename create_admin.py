import os
import django
from django.core.management import call_command

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

def setup_system():
    try:
        # Comando crucial: cria as tabelas no banco de dados
        print("Sincronizando banco de dados...")
        call_command('migrate', interactive=False)
        
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        username = 'admin'
        email = 'admin@exemplo.com'
        password = 'SuaSenhaForte123'

        user, created = User.objects.get_or_create(
            username=username, 
            defaults={'email': email, 'is_staff': True, 'is_superuser': True}
        )
        
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()
        print("Sistema e Admin configurados com sucesso!")
    except Exception as e:
        print(f"Erro crítico: {e}")

if __name__ == "__main__":
    setup_system()