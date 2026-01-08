-- Create audit_logs table for tracking agent actions and token usage
-- This provides an audit trail for all agent operations in the system

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    token_usage JSONB,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_name ON audit_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see audit logs for their own projects
CREATE POLICY "Users can view own project audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = audit_logs.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert audit logs for their own projects
CREATE POLICY "Users can insert own project audit logs" ON audit_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = audit_logs.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON audit_logs TO authenticated;

-- Note: Removed GRANT SELECT to anon for security - audit logs may contain
-- sensitive information and should not be accessible to unauthenticated users
-- (Principle of Least Privilege)
