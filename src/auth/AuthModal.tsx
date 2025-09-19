import { useCallback, useMemo, useState } from 'react';
import { Button, Group, Modal, PasswordInput, SegmentedControl, Stack, Text, Select, Alert, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import { AuthRole } from '@/types/auth';

enum AuthTab {
    Guest = 'guest',
    Login = 'login',
}

interface AuthModalProps {
    opened: boolean;
    onClose: () => void;
    onSuccess: (role: AuthRole) => void;
    // Preferred: validate credentials for selected role ('admin' or 'user')
    validateCredentials?: (role: AuthRole.Admin | AuthRole.User, password: string, username?: string) => boolean | Promise<boolean>;
    // Back-compat: used if validateCredentials is not provided and role is 'admin'
    validateAdminPassword?: (password: string) => boolean | Promise<boolean>;
    // If true, show a prompt to update the default admin password
    adminDefaultPassword?: boolean;
    // Called to update the admin password. Should return true on success.
    onChangeAdminPassword?: (newPassword: string) => Promise<boolean>;
    title?: string;
}

/**
 * Simple authentication modal with two modes: Guest and Admin.
 * - Guest: no password required
 * - Admin: requires password; validated via `validateAdminPassword` if provided, otherwise
 *          falls back to a trivial default check of non-empty password.
 */
export default function AuthModal({ opened, onClose, onSuccess, validateCredentials, validateAdminPassword, adminDefaultPassword = false, onChangeAdminPassword, title = '选择登录模式' }: AuthModalProps) {
    // Visual tab for Guest vs Login
    const [tab, setTab] = useState<AuthTab>(AuthTab.Guest);
    // Role to log into when in Login tab
    const [loginRole, setLoginRole] = useState<AuthRole.User | AuthRole.Admin>(AuthRole.Admin);
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [changingAdminPwd, setChangingAdminPwd] = useState(false);
    const [newAdminPwd, setNewAdminPwd] = useState('');
    const [newAdminPwd2, setNewAdminPwd2] = useState('');
    const [changeMsg, setChangeMsg] = useState<string | null>(null);

    const isLogin = tab === AuthTab.Login;

    const canSubmit = useMemo(() => {
        if (!isLogin) return true;
        if (loginRole === AuthRole.User) return username.trim().length > 0 && password.length > 0;
        return password.length > 0;
    }, [isLogin, loginRole, password, username]);

    const resetState = useCallback(() => {
        setPassword('');
        setError(null);
        setSubmitting(false);
    }, []);

    const handleClose = useCallback(() => {
        resetState();
        onClose();
    }, [onClose, resetState]);

    const handleChangeAdminPassword = useCallback(async () => {
        if (!onChangeAdminPassword) return;
        setSubmitting(true);
        setError(null);
        setChangeMsg(null);
        try {
            const ok = await onChangeAdminPassword(newAdminPwd);
            if (ok) {
                setChangeMsg('管理员密码已更新');
                setChangingAdminPwd(false);
                setNewAdminPwd('');
                setNewAdminPwd2('');
            } else {
                setError('更新失败');
            }
        } catch (e) {
            console.error(e);
            setError('更新失败');
        } finally {
            setSubmitting(false);
        }
    }, [newAdminPwd, onChangeAdminPassword]);

    const handleSubmit = useCallback(async () => {
        setError(null);
        if (!canSubmit) return;

        if (!isLogin) {
            onSuccess(AuthRole.Guest);
            resetState();
            return;
        }

        setSubmitting(true);
        try {
            let ok = false;
            if (validateCredentials) {
                ok = await Promise.resolve(validateCredentials(loginRole, password, loginRole === AuthRole.User ? username : undefined));
            } else if (loginRole === AuthRole.Admin && validateAdminPassword) {
                ok = await Promise.resolve(validateAdminPassword(password));
            } else {
                // Default simple behavior for offline: non-empty password
                ok = password.trim().length > 0;
            }

            if (ok) {
                onSuccess(loginRole);
                resetState();
            } else {
                setError('密码错误');
            }
        } catch (e) {
            console.error(e);
            setError('验证失败，请重试');
        } finally {
            setSubmitting(false);
        }
    }, [canSubmit, isLogin, loginRole, onSuccess, password, username, resetState, validateAdminPassword, validateCredentials]);

    return (
        <Modal opened={opened} onClose={handleClose} title={title} centered>
            <Stack gap="md">
                {adminDefaultPassword && !changingAdminPwd && (
                    <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="安全提示">
                        <Stack>
                            <Text>
                                {'检测到管理员使用默认密码 (admin)。建议立即修改。'}
                            </Text>
                            <Button size="xs" variant="light" onClick={() => setChangingAdminPwd(true)}>
                                修改密码
                            </Button>
                        </Stack>
                    </Alert>
                )}

                {changingAdminPwd && (
                    <Stack gap={6}>
                        <PasswordInput
                            label="新管理员密码"
                            placeholder="输入新密码"
                            value={newAdminPwd}
                            onChange={(e) => setNewAdminPwd(e.currentTarget.value)}
                        />
                        <PasswordInput
                            label="确认新密码"
                            placeholder="再次输入新密码"
                            value={newAdminPwd2}
                            onChange={(e) => setNewAdminPwd2(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && newAdminPwd && newAdminPwd === newAdminPwd2) handleChangeAdminPassword(); }}
                        />
                        {error && (
                            <Text size="sm" c="red.6" aria-live="polite">{error}</Text>
                        )}
                        {changeMsg && (
                            <Text size="sm" c="green.7" aria-live="polite">{changeMsg}</Text>
                        )}
                        <Group justify="flex-end" mt="xs">
                            <Button variant="default" onClick={() => { setChangingAdminPwd(false); setError(null); setChangeMsg(null); }} disabled={submitting}>取消</Button>
                            <Button onClick={handleChangeAdminPassword} disabled={submitting || !newAdminPwd || newAdminPwd !== newAdminPwd2} loading={submitting}>保存新密码</Button>
                        </Group>
                    </Stack>
                )}
                
                <SegmentedControl
                    value={tab}
                    onChange={(v) => {
                        setTab(((v as string) as AuthTab) ?? AuthTab.Guest);
                        setError(null);
                    }}
                    data={[
                        { label: '访客', value: AuthTab.Guest },
                        { label: '登录', value: AuthTab.Login },
                    ]}
                />

                {!changingAdminPwd && isLogin ? (
                    <Stack gap={6}>
                        <Select
                            label="登录身份"
                            value={loginRole}
                            onChange={(v) => setLoginRole(((v as string) as AuthRole.User | AuthRole.Admin) ?? AuthRole.Admin)}
                            data={[
                                { label: '管理员 (admin)', value: AuthRole.Admin },
                                { label: '用户 (user)', value: AuthRole.User },
                            ]}
                        />
                        {loginRole === AuthRole.User && (
                            <TextInput
                                label="用户名"
                                placeholder="输入用户名"
                                value={username}
                                onChange={(e) => setUsername(e.currentTarget.value)}
                            />
                        )}
                        <PasswordInput
                            label="密码"
                            placeholder="输入密码"
                            value={password}
                            onChange={(e) => setPassword(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                            }}
                            autoFocus
                        />
                        {error && (
                            <Text size="sm" c="red.6" aria-live="polite">
                                {error}
                            </Text>
                        )}
                    </Stack>
                ) : (
                    <Text size="sm" c="dimmed">
                        以访客身份继续，无需密码。
                    </Text>
                )}

                <Group justify="flex-end" mt="sm">
                    <Button variant="default" onClick={handleClose} disabled={submitting}>
                        取消
                    </Button>
                    <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
                        {isLogin ? '登录' : '以访客身份继续'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
