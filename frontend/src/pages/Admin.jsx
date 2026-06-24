import React, { useState, useEffect } from 'react';
import { Container, Title, Tabs, Table, Button, Group, Badge, Modal, Select, TextInput, NumberInput, Switch, Stack, Paper, Text, ScrollArea, Box, Radio, Divider, Textarea } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { fetchApi } from '../lib/api';
import { IconShieldCheck, IconUsers, IconMail, IconStack2, IconSettings, IconClock, IconServer, IconListDetails, IconDatabase, IconActivity, IconMessages } from '@tabler/icons-react';

// Components for each tab

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newTier, setNewTier] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/admin/users');
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleAction = async (userId, action, value = null) => {
    if (action === 'reset_password' && !value) return;
    try {
      await fetchApi('/admin/users/action', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, action, value })
      });
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleTierChange = async () => {
    if (!newTier || !selectedUser) return;
    try {
      await fetchApi('/admin/users/action', {
        method: 'POST',
        body: JSON.stringify({ user_id: selectedUser.id, action: 'tier', value: newTier })
      });
      setTierModalOpen(false);
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Users Management</Title>
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Notes/Subj/Grp</Table.Th>
              <Table.Th>Tier</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map(u => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.id}</Table.Td>
                <Table.Td>{u.email}</Table.Td>
                <Table.Td>{u.notes_count} / {u.subjects_count} / {u.groups_count}</Table.Td>
                <Table.Td><Badge color={u.tier === 'pro' ? 'blue' : u.tier === 'unlimited' ? 'grape' : 'gray'}>{u.tier}</Badge></Table.Td>
                <Table.Td>
                  {u.is_active ? <Text c="green" size="sm">Active</Text> : <Text c="red" size="sm">Inactive</Text>}
                  {u.is_admin && <Text c="grape" size="xs">Admin</Text>}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button size="xs" variant="outline" onClick={() => { setSelectedUser(u); setNewTier(u.tier); setTierModalOpen(true); }}>Tier</Button>
                    {u.is_active ? (
                      <Button size="xs" color="red" variant="light" onClick={() => handleAction(u.id, 'deactivate')}>Deactivate</Button>
                    ) : (
                      <Button size="xs" color="green" variant="light" onClick={() => handleAction(u.id, 'activate')}>Activate</Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal opened={tierModalOpen} onClose={() => setTierModalOpen(false)} title="Change User Tier">
        <Stack>
          <TextInput label="User Email" value={selectedUser?.email || ''} disabled />
          <Select label="New Tier" value={newTier} onChange={setNewTier} data={[
            {value: 'unlimited', label: 'Unlimited'},
            {value: 'pro', label: 'Pro'},
            {value: 'early_tester', label: 'Early Testers'},
            {value: 'free', label: 'Free'}
          ]} />
          <Button onClick={handleTierChange}>Update Tier</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

function AdminInvitations() {
  const [invites, setInvites] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteMethod, setInviteMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState('free');

  const loadInvites = async () => {
    try {
      const data = await fetchApi('/admin/invitations');
      setInvites(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadInvites(); }, []);

  const sendInvite = async () => {
    try {
      const sendEmail = inviteMethod === 'email';
      const payload = { tier, send_email: sendEmail };
      if (sendEmail) payload.email = email;
      const res = await fetchApi('/admin/invitations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert(`Invitation Link: ${res.invitation_link}`);
      setModalOpen(false);
      loadInvites();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Pending Invitations</Title>
        <Button onClick={() => setModalOpen(true)}>New Invitation</Button>
      </Group>
      <ScrollArea>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Method</Table.Th>
              <Table.Th>Token</Table.Th>
              <Table.Th>Tier</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {invites.map(i => (
              <Table.Tr key={i.token}>
                <Table.Td>{i.send_email ? i.email : 'Link only'}</Table.Td>
                <Table.Td>{i.send_email ? 'Email' : 'Link'}</Table.Td>
                <Table.Td>{i.token.substring(0, 8)}...</Table.Td>
                <Table.Td>{i.tier}</Table.Td>
                <Table.Td>{i.is_used ? 'Used' : 'Pending'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Invite User">
        <Stack>
          <Radio.Group value={inviteMethod} onChange={setInviteMethod} label="Method">
            <Group>
              <Radio value="email" label="Send Email" />
              <Radio value="link" label="Shareable Link" />
            </Group>
          </Radio.Group>
          {inviteMethod === 'email' && (
            <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          )}
          <Select label="Tier" value={tier} onChange={setTier} data={[
            {value: 'unlimited', label: 'Unlimited'},
            {value: 'pro', label: 'Pro'},
            {value: 'early_tester', label: 'Early Testers'},
            {value: 'free', label: 'Free'}
          ]} />
          <Button onClick={sendInvite}>Create Invitation</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

function AdminTiers() {
  const [tiers, setTiers] = useState([]);
  
  const loadTiers = async () => {
    try {
      const data = await fetchApi('/admin/tiers');
      setTiers(data);
    } catch(e) {}
  };
  
  useEffect(() => { loadTiers(); }, []);

  const saveTier = async (tierData) => {
    try {
      await fetchApi(`/admin/tiers/${tierData.id}`, {
        method: 'PUT',
        body: JSON.stringify(tierData)
      });
      alert('Tier updated!');
      loadTiers();
    } catch(e) { alert(e.message); }
  };

  return (
    <Stack>
      <Title order={3}>Tier Configuration</Title>
      {tiers.map(t => (
        <Paper key={t.id} p="md" withBorder>
          <Title order={4} mb="md">{t.display_name}</Title>
          <Group grow align="flex-end">
            <NumberInput label="Max Notes" value={t.max_notes} onChange={(v) => t.max_notes = v} />
            <NumberInput label="Max Subjects" value={t.max_subjects} onChange={(v) => t.max_subjects = v} />
            <NumberInput label="Max Storage (GB)" value={t.max_storage_gb} onChange={(v) => t.max_storage_gb = v} />
            <Button onClick={() => saveTier(t)}>Save</Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function AdminSystemSettings() {
  const [s, setS] = useState({});
  const loadSettings = async () => {
    try {
      const data = await fetchApi('/admin/system-settings');
      setS(data);
    } catch(e) {}
  };
  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    try {
      await fetchApi('/admin/system-settings', {
        method: 'PUT',
        body: JSON.stringify(s)
      });
      alert('Settings saved!');
    } catch(e) { alert(e.message); }
  };

  return (
    <Stack>
      <Title order={3}>System Settings</Title>
      <Paper p="md" withBorder>
        <Stack>
          <Switch label="Lockdown Mode" checked={s.lockdown_mode || false} onChange={(e) => setS({...s, lockdown_mode: e.currentTarget.checked})} />
          <Switch label="Maintenance Mode" checked={s.maintenance_mode || false} onChange={(e) => setS({...s, maintenance_mode: e.currentTarget.checked})} />
          <Select label="Signup Config" value={s.signup_config || 'open'} onChange={(v) => setS({...s, signup_config: v})} data={['open', 'approval', 'invite']} />
          <TextInput label="Domain URL" value={s.domain_url || ''} onChange={(e) => setS({...s, domain_url: e.currentTarget.value})} />
          <Button onClick={save}>Save Settings</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function AdminRateLimits() {
  const [s, setS] = useState({});
  const loadSettings = async () => {
    try {
      const data = await fetchApi('/admin/rate-limits');
      setS(data);
    } catch(e) {}
  };
  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    try {
      await fetchApi('/admin/rate-limits', {
        method: 'PUT',
        body: JSON.stringify(s)
      });
      alert('Rate limits saved!');
    } catch(e) { alert(e.message); }
  };

  return (
    <Stack>
      <Title order={3}>Rate Limits</Title>
      <Paper p="md" withBorder>
        <Stack>
          <NumberInput label="Per User API calls/min" value={s.per_user_api || 0} onChange={(v) => setS({...s, per_user_api: v})} />
          <NumberInput label="Global API calls/min" value={s.global_api || 0} onChange={(v) => setS({...s, global_api: v})} />
          <Button onClick={save}>Save Rate Limits</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function AdminEmailConfig() {
  const [s, setS] = useState({});
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    fetchApi('/admin/email-config').then(setS).catch(console.error);
  }, []);

  const sendTest = async () => {
    try {
      const res = await fetchApi('/admin/email-config/test', {
        method: 'POST',
        body: JSON.stringify({ test_email: testEmail })
      });
      alert(res.message);
    } catch(e) { alert(e.message); }
  };

  return (
    <Stack>
      <Title order={3}>Email Configuration</Title>
      <Paper p="md" withBorder>
        <Stack>
          <TextInput label="SMTP Provider" value={s.smtp_provider || ''} disabled />
          <TextInput label="Email Address" value={s.email_address || ''} disabled />
          <Divider />
          <Group align="flex-end">
            <TextInput label="Test Email" value={testEmail} onChange={(e) => setTestEmail(e.currentTarget.value)} />
            <Button onClick={sendTest}>Send Test Email</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

function AdminIpFilters() {
  const [filters, setFilters] = useState([]);
  const [filterType, setFilterType] = useState('blacklist');
  const [ruleType, setRuleType] = useState('country');
  const [value, setValue] = useState('');

  const load = async () => {
    fetchApi('/admin/ip-filters').then(setFilters).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    try {
      await fetchApi('/admin/ip-filters', {
        method: 'POST',
        body: JSON.stringify({ filter_type: filterType, rule_type: ruleType, value })
      });
      load();
    } catch(e) { alert(e.message); }
  };

  const remove = async (id) => {
    try {
      await fetchApi(`/admin/ip-filters/${id}`, { method: 'DELETE' });
      load();
    } catch(e) { alert(e.message); }
  };

  return (
    <Stack>
      <Title order={3}>IP Filters</Title>
      <Paper p="md" withBorder>
        <Group align="flex-end">
          <Select label="Type" value={filterType} onChange={setFilterType} data={['blacklist', 'whitelist']} />
          <Select label="Rule" value={ruleType} onChange={setRuleType} data={['country', 'specific_ip']} />
          <TextInput label="Value" value={value} onChange={(e) => setValue(e.currentTarget.value)} />
          <Button onClick={add}>Add</Button>
        </Group>
        <ScrollArea><Table mt="md">
          <Table.Thead><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Type</Table.Th><Table.Th>Value</Table.Th><Table.Th>Action</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {filters.map(f => (
              <Table.Tr key={f.id}>
                <Table.Td>{f.id}</Table.Td>
                <Table.Td>{f.filter_type}</Table.Td>
                <Table.Td>{f.value}</Table.Td>
                <Table.Td><Button size="xs" color="red" variant="subtle" onClick={() => remove(f.id)}>Remove</Button></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table></ScrollArea>
      </Paper>
    </Stack>
  );
}

function AdminSystemLogs() {
  const [logs, setLogs] = useState([]);
  const load = async () => {
    fetchApi('/admin/logs?limit=50').then(setLogs).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  return (
    <Stack>
      <Title order={3}>System Logs</Title>
      <ScrollArea h={500}>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>Time</Table.Th><Table.Th>User</Table.Th><Table.Th>Action</Table.Th><Table.Th>Details</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {logs.map((l, i) => (
              <Table.Tr key={i}>
                <Table.Td>{new Date(l.timestamp).toLocaleString()}</Table.Td>
                <Table.Td>{l.user_id}</Table.Td>
                <Table.Td>{l.action}</Table.Td>
                <Table.Td>{l.details}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function AdminDatabase() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [data, setData] = useState({ columns: [], data: [] });

  useEffect(() => {
    fetchApi('/admin/db/tables').then(setTables).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedTable) {
      fetchApi(`/admin/db/table/${selectedTable}`).then(setData).catch(console.error);
    }
  }, [selectedTable]);

  return (
    <Stack>
      <Title order={3}>Database</Title>
      <Select label="Table" data={tables} value={selectedTable} onChange={setSelectedTable} searchable />
      {selectedTable && (
        <ScrollArea h={500}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                {data.columns.map(c => <Table.Th key={c}>{c}</Table.Th>)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.data.map((row, i) => (
                <Table.Tr key={i}>
                  {data.columns.map(c => <Table.Td key={c}>{String(row[c])}</Table.Td>)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}

function AdminDiagnostics() {
  return (
    <Stack>
      <Title order={3}>Diagnostics</Title>
      <iframe src="/admin/diagnostics" style={{ width: '100%', height: '800px', border: 'none' }} title="Diagnostics" />
    </Stack>
  );
}

function AdminGlobalPrompts() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [formData, setFormData] = useState({ name: '', content: '', icon: '' });

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/admin/global-prompts');
      setPrompts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPrompts(); }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.content) return;
    try {
      if (editingPrompt) {
        await fetchApi(`/admin/global-prompts/${editingPrompt.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi('/admin/global-prompts', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      }
      setModalOpen(false);
      loadPrompts();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    try {
      await fetchApi(`/admin/global-prompts/${id}`, { method: 'DELETE' });
      loadPrompts();
    } catch (e) {
      alert(e.message);
    }
  };

  const openModal = (prompt = null) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setFormData({ name: prompt.name, content: prompt.content, icon: prompt.icon || '' });
    } else {
      setEditingPrompt(null);
      setFormData({ name: '', content: '', icon: '' });
    }
    setModalOpen(true);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Global Prompts</Title>
        <Button onClick={() => openModal()}>Add Prompt</Button>
      </Group>
      
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Content</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {prompts.map(p => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.id}</Table.Td>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>
                  <Text lineClamp={1} size="sm">{p.content}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openModal(p)}>Edit</Button>
                    <Button size="xs" color="red" variant="light" onClick={() => handleDelete(p.id)}>Delete</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {prompts.length === 0 && !loading && (
              <Table.Tr>
                <Table.Td colSpan={4} align="center">No global prompts found.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editingPrompt ? "Edit Prompt" : "New Prompt"}>
        <Stack>
          <TextInput
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
            placeholder="E.g. Concise Bullets"
            required
          />
          <TextInput
            label="Icon"
            value={formData.icon}
            onChange={(e) => setFormData({ ...formData, icon: e.currentTarget.value })}
            placeholder="e.g. IconBrain, IconSchool, IconWand"
            description="Find valid Tabler Icon component names at https://tabler.io/icons (Must start with 'Icon' and be camel cased)."
          />
          <Textarea
            label="Content (Instructions)"
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.currentTarget.value })}
            placeholder="Enter the instructions for the AI..."
            minRows={10}
            autosize
            maxRows={20}
            required
          />
          <Button onClick={handleSave}>{editingPrompt ? "Save Changes" : "Create Prompt"}</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

export default function AdminPage() {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await fetchApi('/auth/me');
        if (user && user.is_admin) {
          setIsAdmin(true);
        } else {
          navigate('/dashboard');
        }
      } catch (e) {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAdmin();
  }, [navigate]);

  if (loading) return <Container mt="xl"><Text>Loading...</Text></Container>;
  if (!isAdmin) return null;

  return (
    <Container size="xl" mt="xl">
      <Group mb="lg">
        <IconShieldCheck size={32} color="purple" />
        <Title order={2}>Admin Dashboard</Title>
      </Group>

      <Tabs defaultValue="users" orientation={isMobile ? 'horizontal' : 'vertical'} placement="left">
        <Tabs.List>
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>Users</Tabs.Tab>
          <Tabs.Tab value="invitations" leftSection={<IconMail size={16} />}>Invitations</Tabs.Tab>
          <Tabs.Tab value="tiers" leftSection={<IconStack2 size={16} />}>Tiers</Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>System Settings</Tabs.Tab>
          <Tabs.Tab value="rate-limits" leftSection={<IconClock size={16} />}>Rate Limits</Tabs.Tab>
          <Tabs.Tab value="email" leftSection={<IconMail size={16} />}>Email Config</Tabs.Tab>
          <Tabs.Tab value="ip" leftSection={<IconServer size={16} />}>IP Filters</Tabs.Tab>
          <Tabs.Tab value="logs" leftSection={<IconListDetails size={16} />}>System Logs</Tabs.Tab>
          <Tabs.Tab value="database" leftSection={<IconDatabase size={16} />}>Database</Tabs.Tab>
          <Tabs.Tab value="diagnostics" leftSection={<IconActivity size={16} />}>Diagnostics</Tabs.Tab>
          <Tabs.Tab value="global-prompts" leftSection={<IconMessages size={16} />}>Global Prompts</Tabs.Tab>
        </Tabs.List>

        <Box pl={{ base: 0, sm: 'md' }} style={{ flex: 1 }}>
          <Tabs.Panel value="users"><AdminUsers /></Tabs.Panel>
          <Tabs.Panel value="invitations"><AdminInvitations /></Tabs.Panel>
          <Tabs.Panel value="tiers"><AdminTiers /></Tabs.Panel>
          <Tabs.Panel value="settings"><AdminSystemSettings /></Tabs.Panel>
          <Tabs.Panel value="rate-limits"><AdminRateLimits /></Tabs.Panel>
          <Tabs.Panel value="email"><AdminEmailConfig /></Tabs.Panel>
          <Tabs.Panel value="ip"><AdminIpFilters /></Tabs.Panel>
          <Tabs.Panel value="logs"><AdminSystemLogs /></Tabs.Panel>
          <Tabs.Panel value="database"><AdminDatabase /></Tabs.Panel>
          <Tabs.Panel value="diagnostics"><AdminDiagnostics /></Tabs.Panel>
          <Tabs.Panel value="global-prompts"><AdminGlobalPrompts /></Tabs.Panel>
        </Box>
      </Tabs>
    </Container>
  );
}
