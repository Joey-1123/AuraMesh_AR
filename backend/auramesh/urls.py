from django.urls import path
from django.views.static import serve
from core import views
from .settings import PROJECT_ROOT

frontend_dir = PROJECT_ROOT / "frontend"
assets_dir = PROJECT_ROOT / "assets"

urlpatterns = [
    path("", views.index, name="index"),
    path("health", views.health, name="health"),
    path("v1/sessions", views.create_session, name="create-session"),
    path("v1/themes", views.themes, name="themes"),
    path("v1/effects/resolve", views.resolve_effect, name="resolve-effect"),
    path("v1/events/gesture", views.post_gesture, name="post-gesture"),
    path("v1/events/sign", views.post_sign, name="post-sign"),
    path("v1/analytics/metrics", views.post_metrics, name="post-metrics"),
    path("v1/analytics/session/<str:session_id>", views.session_analytics, name="session-analytics"),
    path("v1/profiles/<str:user_id>/theme", views.profile_theme, name="profile-theme"),
    path("v1/profiles/<str:user_id>", views.profile_detail, name="profile-detail"),
    path("internal/events", views.internal_event, name="internal-event"),
    path("css/<path:path>", serve, {"document_root": str(frontend_dir / "css")}),
    path("js/<path:path>", serve, {"document_root": str(frontend_dir / "js")}),
    path("assets/<path:path>", serve, {"document_root": str(assets_dir)}),
]
