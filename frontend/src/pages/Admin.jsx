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

function AdminUserContent() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);

  // Data per section
  const [groups, setGroups] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [resources, setResources] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [notes, setNotes] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Detail modals
  const [detailResource, setDetailResource] = useState(null);
  const [detailExercise, setDetailExercise] = useState(null);
  const [detailNote, setDetailNote] = useState(null);
  const [detailConversation, setDetailConversation] = useState(null);
  const [detailConversationMessages, setDetailConversationMessages] = useState([]);

  const [activeSection, setActiveSection] = useState('groups');
  const [sectionLoading, setSectionLoading] = useState(false);

  useEffect(() => {
    fetchApi('/admin/users').then(data => {
      setUsers(data);
      setUsersLoading(false);
    }).catch(() => setUsersLoading(false));
  }, []);

  const loadSection = async (section) => {
    if (!selectedUserId) return;
    setSectionLoading(true);
    try {
      const data = await fetchApi(`/admin/users/${selectedUserId}/${section}`);
      if (section === 'groups') setGroups(data);
      else if (section === 'subjects') setSubjects(data);
      else if (section === 'resources') setResources(data);
      else if (section === 'exercises') setExercises(data);
      else if (section === 'notes') setNotes(data);
      else if (section === 'conversations') setConversations(data);
      else if (section === 'tasks') setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setSectionLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) loadSection(activeSection);
  }, [selectedUserId, activeSection]);

  const deleteItem = async (section, id, confirmMsg) => {
    if (!confirm(confirmMsg || `Delete this ${section.slice(0, -1)}?`)) return;
    try {
      await fetchApi(`/admin/users/${selectedUserId}/${section}/${id}`, { method: 'DELETE' });
      loadSection(activeSection);
    } catch (e) { alert(e.message); }
  };

  const reprocessItem = async (section, id) => {
    if (!confirm(`Reprocess this ${section.slice(0, -1)}?`)) return;
    try {
      const res = await fetchApi(`/admin/users/${selectedUserId}/${section}/${id}/reprocess`, { method: 'POST' });
      alert(`Reprocessing submitted. Task ID: ${res.task_id}`);
    } catch (e) { alert(e.message); }
  };

  const cancelTask = async (taskId) => {
    if (!confirm('Cancel this task?')) return;
    try {
      await fetchApi(`/admin/tasks/${taskId}/cancel`, { method: 'POST' });
      loadSection('tasks');
    } catch (e) { alert(e.message); }
  };

  const viewResource = async (id) => {
    try {
      const data = await fetchApi(`/admin/users/${selectedUserId}/resources/${id}`);
      setDetailResource(data);
    } catch (e) { alert(e.message); }
  };

  const viewExercise = async (id) => {
    try {
      const data = await fetchApi(`/admin/users/${selectedUserId}/exercises/${id}`);
      setDetailExercise(data);
    } catch (e) { alert(e.message); }
  };

  const viewNote = async (id) => {
    try {
      const data = await fetchApi(`/admin/users/${selectedUserId}/notes/${id}`);
      setDetailNote(data);
    } catch (e) { alert(e.message); }
  };

  const viewConversation = async (convId) => {
    try {
      const msgs = await fetchApi(`/admin/users/${selectedUserId}/conversations/${convId}`);
      setDetailConversationMessages(msgs);
      setDetailConversation(convId);
    } catch (e) { alert(e.message); }
  };

  const renderTable = (columns, rows, actions) => (
    <ScrollArea>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>{columns.map(c => <Table.Th key={c.key}>{c.label}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, i) => (
            <Table.Tr key={row.id || i}>
              {columns.map(c => <Table.Td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? '-'}</Table.Td>)}
              {actions && <Table.Td><Group gap="xs" wrap="nowrap">{actions(row)}</Group></Table.Td>}
            </Table.Tr>
          ))}
          {rows.length === 0 && !sectionLoading && (
            <Table.Tr><Table.Td colSpan={columns.length + (actions ? 1 : 0)} align="center">No data</Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );

  const sectionTabs = [
    { value: 'groups', label: 'Groups' },
    { value: 'subjects', label: 'Subjects' },
    { value: 'resources', label: 'Resources' },
    { value: 'exercises', label: 'Exercises' },
    { value: 'notes', label: 'Notes' },
    { value: 'conversations', label: 'Conversations' },
    { value: 'tasks', label: 'Tasks' },
  ];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>User Content Viewer</Title>
      </Group>

      {usersLoading && <Text c="dimmed" size="sm">Loading users...</Text>}

      <Select
        label="Select User"
        placeholder="Choose a user to inspect"
        data={users.map(u => ({ value: String(u.id), label: `${u.email} (ID: ${u.id}, Tier: ${u.tier})` }))}
        value={selectedUserId ? String(selectedUserId) : null}
        onChange={(v) => { setSelectedUserId(v ? Number(v) : null); setActiveSection('groups'); }}
        searchable
        clearable
      />

      {selectedUserId && (
        <>
          <Tabs value={activeSection} onChange={setActiveSection}>
            <Tabs.List>
              {sectionTabs.map(t => <Tabs.Tab key={t.value} value={t.value}>{t.label}</Tabs.Tab>)}
            </Tabs.List>

            {sectionLoading && <Text c="dimmed" size="sm" mt="md">Loading...</Text>}

            {!sectionLoading && (
              <>
                <Tabs.Panel value="groups" pt="sm">
                  {renderTable(
                    [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'subjects', label: 'Subjects', render: (r) => r.subjects?.map(s => s.name).join(', ') || '-' }, { key: 'created_at', label: 'Created' }],
                    groups,
                    (r) => <Button size="xs" color="red" variant="light" onClick={() => deleteItem('groups', r.id)}>Delete</Button>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="subjects" pt="sm">
                  {renderTable(
                    [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'resource_count', label: 'Resources' }, { key: 'created_at', label: 'Created' }],
                    subjects,
                    (r) => <Button size="xs" color="red" variant="light" onClick={() => deleteItem('subjects', r.id)}>Delete</Button>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="resources" pt="sm">
                  {renderTable(
                    [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'file_type', label: 'Type' }, { key: 'file_size', label: 'Size', render: (r) => r.file_size ? `${(r.file_size / 1024).toFixed(0)}KB` : '-' }, { key: 'page_count', label: 'Pages' }, { key: 'processing_time_ms', label: 'Proc ms' }, { key: 'notes_count', label: 'Notes' }, { key: 'created_at', label: 'Created' }],
                    resources,
                    (r) => (
                      <>
                        <Button size="xs" variant="outline" onClick={() => viewResource(r.id)}>View</Button>
                        <Button size="xs" variant="light" onClick={() => reprocessItem('resources', r.id)}>Reprocess</Button>
                        <Button size="xs" color="red" variant="light" onClick={() => deleteItem('resources', r.id)}>Delete</Button>
                      </>
                    )
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="exercises" pt="sm">
                  {renderTable(
                    [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'question_count', label: 'Questions' }, { key: 'model', label: 'Model' }, { key: 'created_at', label: 'Created' }],
                    exercises,
                    (r) => (
                      <>
                        <Button size="xs" variant="outline" onClick={() => viewExercise(r.id)}>View</Button>
                        <Button size="xs" variant="light" onClick={() => reprocessItem('exercises', r.id)}>Reprocess</Button>
                        <Button size="xs" color="red" variant="light" onClick={() => deleteItem('exercises', r.id)}>Delete</Button>
                      </>
                    )
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="notes" pt="sm">
                  {renderTable(
                    [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'summary_type', label: 'Type' }, { key: 'model', label: 'Model' }, { key: 'processing_time_ms', label: 'Proc ms' }, { key: 'created_at', label: 'Created' }],
                    notes,
                    (r) => (
                      <>
                        <Button size="xs" variant="outline" onClick={() => viewNote(r.id)}>View</Button>
                        <Button size="xs" color="red" variant="light" onClick={() => deleteItem('notes', r.id)}>Delete</Button>
                      </>
                    )
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="conversations" pt="sm">
                  {renderTable(
                    [{ key: 'conversation_id', label: 'Conv ID' }, { key: 'title', label: 'Title' }, { key: 'message_count', label: 'Messages' }, { key: 'last_message_at', label: 'Last Message' }],
                    conversations,
                    (r) => <Button size="xs" variant="outline" onClick={() => viewConversation(r.conversation_id)}>View Messages</Button>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="tasks" pt="sm">
                  {renderTable(
                    [{ key: 'task_id', label: 'Task ID' }, { key: 'task_type', label: 'Type' }, { key: 'status', label: 'Status', render: (r) => <Badge color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'running' ? 'yellow' : r.status === 'cancelled' ? 'gray' : 'blue'}>{r.status}</Badge> }, { key: 'progress', label: 'Progress' }, { key: 'error_message', label: 'Error' }, { key: 'is_hung', label: 'Hung?', render: (r) => r.is_hung ? <Badge color="red">YES</Badge> : <Badge color="green">No</Badge> }, { key: 'updated_at', label: 'Updated' }],
                    tasks,
                    (r) => r.status === 'pending' || r.status === 'running' ? <Button size="xs" color="red" variant="light" onClick={() => cancelTask(r.task_id)}>Cancel</Button> : null
                  )}
                </Tabs.Panel>
              </>
            )}
          </Tabs>

          {/* Resource Detail Modal */}
          <Modal opened={!!detailResource} onClose={() => setDetailResource(null)} title={`Resource: ${detailResource?.title || ''}`} size="xl">
            {detailResource && (
              <Stack>
                <Group><Text fw={500}>ID:</Text><Text>{detailResource.id}</Text></Group>
                <Group><Text fw={500}>Title:</Text><Text>{detailResource.title}</Text></Group>
                <Group><Text fw={500}>File:</Text><Text>{detailResource.file_name} ({detailResource.file_type})</Text></Group>
                <Group><Text fw={500}>Size:</Text><Text>{detailResource.file_size ? `${(detailResource.file_size / 1024).toFixed(0)} KB` : '-'}</Text></Group>
                <Group><Text fw={500}>Pages:</Text><Text>{detailResource.page_count ?? '-'}</Text></Group>
                <Group><Text fw={500}>Processing Time:</Text><Text>{detailResource.processing_time_ms ? `${detailResource.processing_time_ms}ms` : '-'}</Text></Group>
                {detailResource.timings && (
                  <>
                    <Text fw={500}>Processing Timings:</Text>
                    <Paper p="sm" withBorder><Box component="pre" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(detailResource.timings, null, 2)}</Box></Paper>
                  </>
                )}
                {detailResource.extracted_text && (
                  <>
                    <Text fw={500}>Extracted Text ({detailResource.content_length} chars):</Text>
                    <ScrollArea h={300}>
                      <Paper p="sm" withBorder><Box component="pre" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{detailResource.extracted_text}</Box></Paper>
                    </ScrollArea>
                  </>
                )}
              </Stack>
            )}
          </Modal>

          {/* Exercise Detail Modal */}
          <Modal opened={!!detailExercise} onClose={() => setDetailExercise(null)} title={`Exercise: ${detailExercise?.title || ''}`} size="xl">
            {detailExercise && (
              <Stack>
                <Group><Text fw={500}>ID:</Text><Text>{detailExercise.id}</Text></Group>
                <Group><Text fw={500}>Model:</Text><Text>{detailExercise.model || '-'}</Text></Group>
                <Group><Text fw={500}>Processing Time:</Text><Text>{detailExercise.processing_time_ms ? `${detailExercise.processing_time_ms}ms` : '-'}</Text></Group>
                {detailExercise.questions && detailExercise.questions.length > 0 && (
                  <>
                    <Text fw={500}>Questions ({detailExercise.questions.length}):</Text>
                    <ScrollArea h={400}>
                      {detailExercise.questions.map((q, i) => (
                        <Paper key={q.id || i} p="sm" withBorder mb="xs">
                          <Text size="sm" fw={500}>Q{i + 1}: {q.question_text}</Text>
                          <Text size="sm" c="dimmed">Answer: {q.answer_text}</Text>
                          {q.explanation && <Text size="sm" c="blue">Explanation: {q.explanation}</Text>}
                        </Paper>
                      ))}
                    </ScrollArea>
                  </>
                )}
              </Stack>
            )}
          </Modal>

          {/* Note Detail Modal */}
          <Modal opened={!!detailNote} onClose={() => setDetailNote(null)} title={`Note: ${detailNote?.title || ''}`} size="xl">
            {detailNote && (
              <Stack>
                <Group><Text fw={500}>ID:</Text><Text>{detailNote.id}</Text></Group>
                <Group><Text fw={500}>Type:</Text><Text>{detailNote.summary_type}</Text></Group>
                <Group><Text fw={500}>Mode:</Text><Text>{detailNote.mode || '-'}</Text></Group>
                <Group><Text fw={500}>Format:</Text><Text>{detailNote.output_format || '-'}</Text></Group>
                <Group><Text fw={500}>Model:</Text><Text>{detailNote.model || '-'}</Text></Group>
                <Group><Text fw={500}>Processing Time:</Text><Text>{detailNote.processing_time_ms ? `${detailNote.processing_time_ms}ms` : '-'}</Text></Group>
                <Group><Text fw={500}>Version:</Text><Text>{detailNote.version}</Text></Group>
                <Group><Text fw={500}>User Edited:</Text><Badge color={detailNote.is_user_edited ? 'yellow' : 'green'}>{String(detailNote.is_user_edited)}</Badge></Group>
                {detailNote.content && (
                  <>
                    <Text fw={500}>Content ({detailNote.content_length} chars):</Text>
                    <ScrollArea h={400}>
                      <Paper p="sm" withBorder><Box component="pre" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{detailNote.content}</Box></Paper>
                    </ScrollArea>
                  </>
                )}
                {detailNote.quickread && (
                  <>
                    <Text fw={500}>Quickread:</Text>
                    <ScrollArea h={200}>
                      <Paper p="sm" withBorder><Box component="pre" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{detailNote.quickread}</Box></Paper>
                    </ScrollArea>
                  </>
                )}
              </Stack>
            )}
          </Modal>

          {/* Conversation Messages Modal */}
          <Modal opened={!!detailConversation} onClose={() => { setDetailConversation(null); setDetailConversationMessages([]); }} title={`Conversation: ${detailConversation}`} size="xl">
            <ScrollArea h={500}>
              {detailConversationMessages.map((m, i) => (
                <Paper key={m.id || i} p="sm" withBorder mb="md">
                  <Text size="xs" c="dimmed" mb="xs">{new Date(m.created_at).toLocaleString()} | {m.ai_model || '-'} | Mode: {m.ai_mode || '-'}</Text>
                  <Box mb="xs" p="xs" style={{ backgroundColor: '#f0f4ff', borderRadius: 4 }}>
                    <Text size="sm" fw={500}>Q:</Text>
                    <Text size="sm">{m.message}</Text>
                  </Box>
                  <Box p="xs" style={{ backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    <Text size="sm" fw={500}>A:</Text>
                    <Text size="sm">{m.response}</Text>
                  </Box>
                  {m.sources && <Text size="xs" c="dimmed" mt="xs">Sources: {m.sources}</Text>}
                  {m.rating != null && <Text size="xs" mt="xs">Rating: {m.rating}/5{m.rating_comment ? ` - ${m.rating_comment}` : ''}</Text>}
                </Paper>
              ))}
              {detailConversationMessages.length === 0 && <Text c="dimmed">No messages in this conversation.</Text>}
            </ScrollArea>
          </Modal>
        </>
      )}
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
          <Tabs.Tab value="user-content" leftSection={<IconUsers size={16} />}>User Content</Tabs.Tab>
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
          <Tabs.Panel value="user-content"><AdminUserContent /></Tabs.Panel>
        </Box>
      </Tabs>
    </Container>
  );
}
