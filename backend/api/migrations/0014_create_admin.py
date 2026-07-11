from django.db import migrations

def create_admin(apps, schema_editor):
    User = apps.get_model('api', 'User')
    if not User.objects.filter(username="admin").exists():
        User.objects.create(
            username="admin",
            password="admin",
            role="admin",
            status="Active",
            credit=0
        )

def reverse_func(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    dependencies = [
        ('api', '0013_campaign_complete_at_campaign_file_urls_and_more'),
    ]
    operations = [
        migrations.RunPython(create_admin, reverse_func),
    ]