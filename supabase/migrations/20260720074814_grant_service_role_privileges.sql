-- Auth bootstrap uses service_role to bind the three shared Auth users to
-- application roles. BYPASSRLS does not replace ordinary table privileges.
-- Keep this grant deliberately narrow; the service key must never reach a browser.

grant select, insert, update on public.app_accounts to service_role;
