from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM ---
    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")

    # Reasoning model — used for slow path + response generation
    reasoning_model: str = "claude-sonnet-4-6"
    # Fast reasoning model — used for fast path conversational replies
    fast_reasoning_model: str = "claude-haiku-4-5-20251001"
    # Classification model — used for fast, cheap perception calls
    classification_model: str = "claude-haiku-4-5-20251001"
    # Computer use agent model — must support computer-use-2025-11-24 beta
    computer_use_model: str = "claude-opus-4-6"
    # Embedding model
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # --- Database ---
    database_url: str = Field(..., alias="DATABASE_URL")

    # --- Redis (optional — blank to use in-memory fallback for local dev) ---
    redis_url: str = Field(default="", alias="REDIS_URL")

    # --- App ---
    app_env: str = Field(default="development", alias="APP_ENV")
    secret_key: str = Field(default="dev-secret", alias="SECRET_KEY")

    # --- Brain thresholds ---
    escalation_threshold: float = 0.45
    slow_path_stakes_threshold: str = "high"
    max_episodic_tokens: int = 6000
    working_memory_max_turns: int = 20

    # --- Google OAuth (for Gmail ingestion) ---
    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://localhost:8000/ingestion/gmail/callback",
        alias="GOOGLE_REDIRECT_URI",
    )

    # --- Stripe ---
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", alias="STRIPE_WEBHOOK_SECRET")
    # Subscription price IDs — create these in the Stripe dashboard (Products → Add product)
    stripe_personal_monthly_price_id: str = Field(default="", alias="STRIPE_PERSONAL_MONTHLY_PRICE_ID")
    stripe_personal_yearly_price_id: str = Field(default="", alias="STRIPE_PERSONAL_YEARLY_PRICE_ID")
    stripe_ent_pro_monthly_price_id: str = Field(default="", alias="STRIPE_ENT_PRO_MONTHLY_PRICE_ID")
    stripe_ent_pro_yearly_price_id: str = Field(default="", alias="STRIPE_ENT_PRO_YEARLY_PRICE_ID")
    stripe_ent_max_monthly_price_id: str = Field(default="", alias="STRIPE_ENT_MAX_MONTHLY_PRICE_ID")
    stripe_ent_max_yearly_price_id: str = Field(default="", alias="STRIPE_ENT_MAX_YEARLY_PRICE_ID")
    # Credit pack price IDs (one-time payments) — optional, falls back to inline price_data
    stripe_credits_starter_price_id: str = Field(default="", alias="STRIPE_CREDITS_STARTER_PRICE_ID")
    stripe_credits_standard_price_id: str = Field(default="", alias="STRIPE_CREDITS_STANDARD_PRICE_ID")
    stripe_credits_pro_price_id: str = Field(default="", alias="STRIPE_CREDITS_PRO_PRICE_ID")
    app_url: str = Field(default="http://localhost:3000", alias="APP_URL")

    # --- Ingestion ---
    ingestion_chunk_max_chars: int = 1800   # ~400–450 words per chunk
    ingestion_batch_size: int = 50          # chunks per embed_batch call
    gmail_fetch_days: int = 180             # look back N days when syncing

    # --- Meeting Bot (Recall.ai) ---
    recall_api_key: str = Field(default="", alias="RECALL_API_KEY")
    recall_api_base: str = Field(default="https://us-east-1.recall.ai/api/v1", alias="RECALL_API_BASE")

    # --- Voice (ElevenLabs) ---
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")

    # --- CORS ---
    # Comma-separated list of allowed origins in production.
    # e.g. https://yourdomain.com,https://www.yourdomain.com
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")

    # --- At-rest encryption ---
    # 32-byte key, base64-encoded. Generate with:
    # python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    encryption_key: str = Field(default="", alias="ENCRYPTION_KEY")

    # --- Admin ---
    admin_user_id: str = Field(default="", alias="ADMIN_USER_ID")

    # --- Slack ---
    slack_client_id: str = Field(default="", alias="SLACK_CLIENT_ID")
    slack_client_secret: str = Field(default="", alias="SLACK_CLIENT_SECRET")
    slack_signing_secret: str = Field(default="", alias="SLACK_SIGNING_SECRET")
    slack_redirect_uri: str = Field(
        default="http://localhost:8000/slack/callback",
        alias="SLACK_REDIRECT_URI",
    )

    # --- GitHub OAuth (for commit/PR ingestion) ---
    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", alias="GITHUB_CLIENT_SECRET")
    github_redirect_uri: str = Field(
        default="http://localhost:8000/ingestion/github/callback",
        alias="GITHUB_REDIRECT_URI",
    )

    # --- Notion OAuth (for page ingestion) ---
    notion_client_id: str = Field(default="", alias="NOTION_CLIENT_ID")
    notion_client_secret: str = Field(default="", alias="NOTION_CLIENT_SECRET")
    notion_redirect_uri: str = Field(
        default="http://localhost:8000/ingestion/notion/callback",
        alias="NOTION_REDIRECT_URI",
    )

    # --- Gmail Push (Pub/Sub) ---
    gmail_pubsub_topic: str = Field(default="", alias="GMAIL_PUBSUB_TOPIC")
    pubsub_verification_token: str = Field(default="", alias="PUBSUB_VERIFICATION_TOKEN")


settings = Settings()  # type: ignore[call-arg]
