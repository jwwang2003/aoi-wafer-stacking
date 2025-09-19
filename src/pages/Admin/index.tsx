import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { AuthRole } from '@/types/auth';
import { Box, Button, Divider, Flex, Group, PasswordInput, Table, Text, TextInput, Title } from '@mantine/core';
import { infoToast, errorToast } from '@/components/UI/Toaster';
import * as authDb from '@/db/auth';
import { ADMIN_DEFAULT_PASSWORD } from '@/env';

export default function Admin() {
    const role = useSelector((s: RootState) => s.auth.role);

    if (role !== AuthRole.Admin) {
        return (
            <Flex p={24} direction="column" gap={8}>
                <Title order={3}>无权限</Title>
                <Text c="dimmed">此页面仅限管理员访问。</Text>
            </Flex>
        );
    }

    return (
        <Flex p={16} direction="column" gap={24}>
            <Title order={2}>管理员中心</Title>
            <AdminPasswordPanel />
            <Divider />
            <UserManagementPanel />
        </Flex>
    );
}

function AdminPasswordPanel() {
    const [pwd1, setPwd1] = useState('');
    const [pwd2, setPwd2] = useState('');
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);

    async function onSave() {
        if (!pwd1 || !pwd2) {
            errorToast({ title: '错误', message: '请输入两次新密码' });
            return;
        }
        if (pwd1 !== pwd2) {
            errorToast({ title: '错误', message: '两次输入的密码不一致' });
            return;
        }
        try {
            setSaving(true);
            const rows = await authDb.updateAdminPassword(pwd1);
            if (rows > 0) {
                infoToast({ title: '成功', message: '已更新管理员密码' });
                setPwd1('');
                setPwd2('');
            } else {
                errorToast({ title: '未更改', message: '密码可能相同或更新失败' });
            }
        } catch (e) {
            errorToast({ title: '更新失败', message: String(e) });
        } finally {
            setSaving(false);
        }
    }

    async function onResetDefault() {
        if (!await confirm('确认将管理员密码重置为默认值?')) return;
        try {
            setResetting(true);
            const rows = await authDb.updateAdminPassword(ADMIN_DEFAULT_PASSWORD);
            if (rows > 0) {
                infoToast({ title: '已重置', message: '管理员密码已重置为默认值' });
                setPwd1('');
                setPwd2('');
            } else {
                errorToast({ title: '未更改', message: '密码可能相同或更新失败' });
            }
        } catch (e) {
            errorToast({ title: '重置失败', message: String(e) });
        } finally {
            setResetting(false);
        }
    }

    return (
        <Box>
            <Title order={3} mb={12}>重置管理员密码</Title>
            <Group align="end" gap="md">
                <PasswordInput label="新密码" value={pwd1} onChange={(e) => setPwd1(e.currentTarget.value)} w={260} />
                <PasswordInput label="再次输入新密码" value={pwd2} onChange={(e) => setPwd2(e.currentTarget.value)} w={260} />
                <Button onClick={onSave} loading={saving}>保存</Button>
                <Button variant="light" color="red" onClick={onResetDefault} loading={resetting}>重置为默认</Button>
            </Group>
        </Box>
    );
}

type UserRow = { username: string; role: AuthRole };

function UserManagementPanel() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [busyUser, setBusyUser] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const rows = await authDb.listUsers();
            setUsers(rows);
        } catch (e) {
            errorToast({ title: '加载失败', message: String(e) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    async function onCreate() {
        if (!newUser || !newPwd) {
            errorToast({ title: '错误', message: '请输入用户名和密码' });
            return;
        }
        try {
            setBusyUser(newUser);
            const rows = await authDb.createUser(newUser, newPwd);
            if (rows > 0) {
                infoToast({ title: '成功', message: `已创建用户 ${newUser}` });
                setNewUser('');
                setNewPwd('');
                await load();
            } else {
                errorToast({ title: '失败', message: '用户已存在或无法创建' });
            }
        } catch (e) {
            errorToast({ title: '创建失败', message: String(e) });
        } finally {
            setBusyUser(null);
        }
    }

    async function onReset(username: string) {
        const pwd = prompt(`为 ${username} 设置新密码`);
        if (!pwd) return;
        try {
            setBusyUser(username);
            const rows = await authDb.updateUserPassword(username, pwd);
            if (rows > 0) {
                infoToast({ title: '成功', message: `已更新 ${username} 的密码` });
            } else {
                errorToast({ title: '失败', message: '密码未更新' });
            }
        } catch (e) {
            errorToast({ title: '更新失败', message: String(e) });
        } finally {
            setBusyUser(null);
        }
    }

    async function onDelete(username: string) {
        if (!confirm(`确认删除用户 ${username}?`)) return;
        try {
            setBusyUser(username);
            const rows = await authDb.deleteUser(username);
            if (rows > 0) {
                infoToast({ title: '已删除', message: `用户 ${username} 已删除` });
                await load();
            } else {
                errorToast({ title: '失败', message: '未删除任何记录' });
            }
        } catch (e) {
            errorToast({ title: '删除失败', message: String(e) });
        } finally {
            setBusyUser(null);
        }
    }

    return (
        <Box>
            <Title order={3} mb={12}>用户管理</Title>
            <Group align="end" gap="md" mb={12}>
                <TextInput label="用户名" value={newUser} onChange={(e) => setNewUser(e.currentTarget.value)} w={220} />
                <PasswordInput label="密码" value={newPwd} onChange={(e) => setNewPwd(e.currentTarget.value)} w={220} />
                <Button onClick={onCreate} loading={busyUser === newUser}>创建</Button>
            </Group>

            <Table striped withTableBorder withColumnBorders stickyHeader stickyHeaderOffset={0}>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>用户名</Table.Th>
                        <Table.Th>角色</Table.Th>
                        <Table.Th style={{ width: 220 }}>操作</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {loading ? (
                        <Table.Tr><Table.Td colSpan={3}><Text c="dimmed">加载中...</Text></Table.Td></Table.Tr>
                    ) : users.length === 0 ? (
                        <Table.Tr><Table.Td colSpan={3}><Text c="dimmed">暂无用户</Text></Table.Td></Table.Tr>
                    ) : (
                        users.map((u) => (
                            <Table.Tr key={u.username}>
                                <Table.Td>{u.username}</Table.Td>
                                <Table.Td>{u.role}</Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Button size="xs" variant="light" onClick={() => onReset(u.username)} loading={busyUser === u.username}>重置密码</Button>
                                        <Button size="xs" color="red" variant="light" onClick={() => onDelete(u.username)} loading={busyUser === u.username}>删除</Button>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))
                    )}
                </Table.Tbody>
            </Table>
        </Box>
    );
}
