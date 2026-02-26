import os
import django
from django.core.management import call_command

# Configuração do ambiente Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clube.settings')
django.setup()

def setup_database():
    try:
        print("1. Gerando arquivos de migração...")
        # Força o Django a olhar para o models.py e criar os scripts de criação de tabela
        call_command('makemigrations', 'beneficios', interactive=False)
        
        print("2. Aplicando migrações no banco de dados...")
        # Executa a criação real das tabelas (Partner, Offer, etc)
        call_command('migrate', interactive=False)
        
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        username = 'admin'
        email = 'admin@exemplo.com'
        password = 'SuaSenhaForte123'

        print("3. Configurando usuário administrador...")
        user, created = User.objects.get_or_create(
            username=username, 
            defaults={'email': email, 'is_staff': True, 'is_superuser': True}
        )
        
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()
        
        print("### Sucesso: Tabelas criadas e Admin configurado! ###")
    except Exception as e:
        print(f"### Erro Crítico: {e} ###")

if __name__ == "__main__":
    setup_database()