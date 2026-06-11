import 'package:flutter/material.dart';

import '../application/crm_workspace_controller.dart';
import '../domain/crm_models.dart';

enum _WorkspaceSection { accounts, signals, pipeline, activities }

class CrmWorkspacePage extends StatefulWidget {
  const CrmWorkspacePage({required this.controller, super.key});

  final CrmWorkspaceController controller;

  @override
  State<CrmWorkspacePage> createState() => _CrmWorkspacePageState();
}

class _CrmWorkspacePageState extends State<CrmWorkspacePage> {
  _WorkspaceSection _section = _WorkspaceSection.accounts;
  String _selectedAccountId = 'account-1';

  CrmWorkspaceController get _controller => widget.controller;

  void _selectAccount(String accountId) {
    setState(() {
      _selectedAccountId = accountId;
      _section = _WorkspaceSection.accounts;
    });
  }

  Future<void> _createAccountFromSignal(String signalId) async {
    try {
      final account = await _controller.createAccountFromSignal(signalId);
      if (!mounted) {
        return;
      }
      _selectAccount(account.id);
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _controller.lastErrorMessage ??
                'Klarte ikke å opprette account fra signalet.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth >= 860;
            return Scaffold(
              appBar: AppBar(
                title: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.radar_outlined),
                    SizedBox(width: 10),
                    Flexible(child: Text('crm_signal CRM')),
                  ],
                ),
                actions: const [
                  Padding(
                    padding: EdgeInsets.only(right: 16),
                    child: CircleAvatar(radius: 16, child: Text('K')),
                  ),
                ],
              ),
              bottomNavigationBar: isWide
                  ? null
                  : NavigationBar(
                      selectedIndex: _section.index,
                      onDestinationSelected: (index) {
                        setState(() {
                          _section = _WorkspaceSection.values[index];
                        });
                      },
                      destinations: const [
                        NavigationDestination(
                          icon: Icon(Icons.business_outlined),
                          selectedIcon: Icon(Icons.business),
                          label: 'Accounts',
                        ),
                        NavigationDestination(
                          icon: Icon(Icons.notifications_outlined),
                          selectedIcon: Icon(Icons.notifications),
                          label: 'Signaler',
                        ),
                        NavigationDestination(
                          icon: Icon(Icons.view_kanban_outlined),
                          selectedIcon: Icon(Icons.view_kanban),
                          label: 'Pipeline',
                        ),
                        NavigationDestination(
                          icon: Icon(Icons.task_alt_outlined),
                          selectedIcon: Icon(Icons.task_alt),
                          label: 'Oppgaver',
                        ),
                      ],
                    ),
              body: Row(
                children: [
                  if (isWide)
                    NavigationRail(
                      extended: constraints.maxWidth >= 1180,
                      selectedIndex: _section.index,
                      onDestinationSelected: (index) {
                        setState(() {
                          _section = _WorkspaceSection.values[index];
                        });
                      },
                      labelType: constraints.maxWidth >= 1180
                          ? NavigationRailLabelType.none
                          : NavigationRailLabelType.all,
                      destinations: const [
                        NavigationRailDestination(
                          icon: Icon(Icons.business_outlined),
                          selectedIcon: Icon(Icons.business),
                          label: Text('Accounts'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.notifications_outlined),
                          selectedIcon: Icon(Icons.notifications),
                          label: Text('Signaler'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.view_kanban_outlined),
                          selectedIcon: Icon(Icons.view_kanban),
                          label: Text('Pipeline'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.task_alt_outlined),
                          selectedIcon: Icon(Icons.task_alt),
                          label: Text('Oppgaver'),
                        ),
                      ],
                    ),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.all(isWide ? 24 : 14),
                      child: _sectionContent(),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _sectionContent() {
    if (_controller.isLoading && !_controller.hasLoaded) {
      return const _LoadingWorkspace();
    }

    return switch (_section) {
      _WorkspaceSection.accounts => _AccountsSection(
        controller: _controller,
        selectedAccountId: _selectedAccountId,
        onAccountSelected: _selectAccount,
      ),
      _WorkspaceSection.signals => _SignalsSection(
        controller: _controller,
        onCreateAccount: _createAccountFromSignal,
        onOpenAccount: _selectAccount,
      ),
      _WorkspaceSection.pipeline => _PipelineSection(
        controller: _controller,
        onOpenAccount: _selectAccount,
      ),
      _WorkspaceSection.activities => _ActivitiesSection(
        controller: _controller,
        onOpenAccount: _selectAccount,
      ),
    };
  }
}

class _AccountsSection extends StatelessWidget {
  const _AccountsSection({
    required this.controller,
    required this.selectedAccountId,
    required this.onAccountSelected,
  });

  final CrmWorkspaceController controller;
  final String selectedAccountId;
  final ValueChanged<String> onAccountSelected;

  @override
  Widget build(BuildContext context) {
    if (controller.accounts.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PageHeader(
            title: 'Accounts',
            subtitle:
                'Operativ CRM-flate for organisasjoner, roller og relasjoner.',
            trailing: FilledButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.add_business),
              label: const Text('Ny account'),
            ),
          ),
          const SizedBox(height: 16),
          _SummaryStrip(controller: controller),
          const SizedBox(height: 16),
          const Expanded(
            child: _EmptyPanel(
              icon: Icons.business_outlined,
              title: 'Ingen accounts ennå',
              body: 'Opprett en account fra signalfeed eller legg inn manuelt.',
            ),
          ),
        ],
      );
    }

    final selectedAccount =
        controller.accountById(selectedAccountId) ?? controller.accounts.first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PageHeader(
          title: 'Accounts',
          subtitle:
              'Operativ CRM-flate for organisasjoner, roller og relasjoner.',
          trailing: FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.add_business),
            label: const Text('Ny account'),
          ),
        ),
        const SizedBox(height: 16),
        _SummaryStrip(controller: controller),
        const SizedBox(height: 16),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 980;
              if (!isWide) {
                return ListView(
                  children: [
                    _AccountList(
                      accounts: controller.accounts,
                      selectedAccountId: selectedAccount.id,
                      onAccountSelected: onAccountSelected,
                      scrollable: false,
                    ),
                    const SizedBox(height: 16),
                    _AccountDetail(
                      controller: controller,
                      account: selectedAccount,
                      scrollable: false,
                    ),
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    width: 390,
                    child: _AccountList(
                      accounts: controller.accounts,
                      selectedAccountId: selectedAccount.id,
                      onAccountSelected: onAccountSelected,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _AccountDetail(
                      controller: controller,
                      account: selectedAccount,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({required this.controller});

  final CrmWorkspaceController controller;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 760 ? 4 : 2;
        final itemWidth = (constraints.maxWidth - (columns - 1) * 12) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _MetricCard(
              width: itemWidth,
              label: 'Accounts',
              value: '${controller.accounts.length}',
              icon: Icons.business_outlined,
            ),
            _MetricCard(
              width: itemWidth,
              label: 'Åpne signaler',
              value: '${controller.openSignalCount}',
              icon: Icons.notifications_active_outlined,
            ),
            _MetricCard(
              width: itemWidth,
              label: 'Pipeline',
              value: _formatNok(controller.pipelineValueNok),
              icon: Icons.trending_up,
            ),
            _MetricCard(
              width: itemWidth,
              label: 'Oppgaver',
              value: '${controller.activities.length}',
              icon: Icons.task_alt_outlined,
            ),
          ],
        );
      },
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.width,
    required this.label,
    required this.value,
    required this.icon,
  });

  final double width;
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return SizedBox(
      width: width,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, color: colors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountList extends StatelessWidget {
  const _AccountList({
    required this.accounts,
    required this.selectedAccountId,
    required this.onAccountSelected,
    this.scrollable = true,
  });

  final List<Account> accounts;
  final String selectedAccountId;
  final ValueChanged<String> onAccountSelected;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: !scrollable,
      physics: scrollable ? null : const NeverScrollableScrollPhysics(),
      itemCount: accounts.length,
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final account = accounts[index];
        final selected = account.id == selectedAccountId;
        return _AccountListItem(
          account: account,
          selected: selected,
          onTap: () => onAccountSelected(account.id),
        );
      },
    );
  }
}

class _AccountListItem extends StatelessWidget {
  const _AccountListItem({
    required this.account,
    required this.selected,
    required this.onTap,
  });

  final Account account;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: selected ? colors.primary : const Color(0xFFE1E5E8),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      account.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    account.updatedLabel,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${account.orgnr} · ${account.municipality}',
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 10),
              _RoleWrap(roles: account.roles),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountDetail extends StatelessWidget {
  const _AccountDetail({
    required this.controller,
    required this.account,
    this.scrollable = true,
  });

  final CrmWorkspaceController controller;
  final Account account;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final contacts = controller.contactsForAccount(account.id);
    final deals = controller.dealsForAccount(account.id);
    final activities = controller.activitiesForAccount(account.id);
    final notes = controller.notesForAccount(account.id);
    final signals = controller.signalsForAccount(account.id);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE1E5E8)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView(
        shrinkWrap: !scrollable,
        physics: scrollable ? null : const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      account.name,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    Text('${account.orgnr} · ${account.nace}'),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              IconButton.filledTonal(
                onPressed: () {},
                tooltip: 'Rediger account',
                icon: const Icon(Icons.edit_outlined),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _RoleWrap(roles: account.roles),
          const SizedBox(height: 20),
          _DetailGrid(
            children: [
              _FactTile(label: 'Eier', value: account.owner),
              _FactTile(label: 'Kommune', value: account.municipality),
              _FactTile(label: 'Kontakter', value: '${contacts.length}'),
              _FactTile(label: 'Signaler', value: '${signals.length}'),
            ],
          ),
          const SizedBox(height: 24),
          _SectionTitle(
            title: 'Kontakter',
            action: TextButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.person_add_alt_outlined),
              label: const Text('Legg til'),
            ),
          ),
          ...contacts.map(_ContactRow.new),
          const SizedBox(height: 24),
          _SectionTitle(
            title: 'Pipeline',
            action: TextButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.add_chart_outlined),
              label: const Text('Ny deal'),
            ),
          ),
          ...deals.map(_DealRow.new),
          const SizedBox(height: 24),
          _SectionTitle(title: 'Neste aktiviteter'),
          ...activities.map(_ActivityRow.new),
          const SizedBox(height: 24),
          _SectionTitle(title: 'Signaler'),
          if (signals.isEmpty)
            const _EmptyLine(
              text: 'Ingen signaler er koblet til accounten ennå.',
            )
          else
            ...signals.map(_LinkedSignalRow.new),
          const SizedBox(height: 24),
          _SectionTitle(title: 'Notater'),
          if (notes.isEmpty)
            const _EmptyLine(text: 'Ingen notater ennå.')
          else
            ...notes.map(_NoteRow.new),
        ],
      ),
    );
  }
}

class _SignalsSection extends StatelessWidget {
  const _SignalsSection({
    required this.controller,
    required this.onCreateAccount,
    required this.onOpenAccount,
  });

  final CrmWorkspaceController controller;
  final Future<void> Function(String signalId) onCreateAccount;
  final ValueChanged<String> onOpenAccount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: 'Signalfeed',
          subtitle:
              'CRM-appen konsumerer signaler og bestemmer hva teamet gjør med dem.',
        ),
        const SizedBox(height: 16),
        Expanded(
          child: controller.signals.isEmpty
              ? const _EmptyPanel(
                  icon: Icons.notifications_outlined,
                  title: 'Ingen signaler',
                  body: 'Signalfeed vises her når CRM API-et har relevante funn.',
                )
              : ListView.separated(
                  itemCount: controller.signals.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final signal = controller.signals[index];
                    final isCreating = controller.isCreatingAccountFromSignal(
                      signal.id,
                    );
                    return _SignalCard(
                      signal: signal,
                      isCreatingAccount: isCreating,
                      onCreateAccount: isCreating
                          ? null
                          : () async {
                              await onCreateAccount(signal.id);
                            },
                      onOpenAccount: signal.linkedAccountId == null
                          ? null
                          : () => onOpenAccount(signal.linkedAccountId!),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _SignalCard extends StatelessWidget {
  const _SignalCard({
    required this.signal,
    required this.isCreatingAccount,
    required this.onCreateAccount,
    required this.onOpenAccount,
  });

  final CrmSignal signal;
  final bool isCreatingAccount;
  final VoidCallback? onCreateAccount;
  final VoidCallback? onOpenAccount;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final linked = signal.status == SignalStatus.linked;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _ScoreBadge(score: signal.score),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        signal.title,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        signal.organizationName,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  signal.observedLabel,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(signal.reason),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Chip(
                  avatar: const Icon(Icons.tag, size: 16),
                  label: Text(signal.orgnr),
                ),
                Chip(
                  avatar: Icon(
                    linked ? Icons.link : Icons.fiber_new_outlined,
                    size: 16,
                  ),
                  label: Text(linked ? 'Koblet til account' : 'Ny mulighet'),
                ),
                if (linked)
                  OutlinedButton.icon(
                    onPressed: onOpenAccount,
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('Åpne account'),
                  )
                else
                  FilledButton.icon(
                    onPressed: onCreateAccount,
                    icon: const Icon(Icons.add_business),
                    label: Text(
                      isCreatingAccount ? 'Oppretter' : 'Opprett account',
                    ),
                  ),
                TextButton.icon(
                  onPressed: () {},
                  icon: Icon(
                    Icons.visibility_off_outlined,
                    color: colors.outline,
                  ),
                  label: const Text('Avvis'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PipelineSection extends StatelessWidget {
  const _PipelineSection({
    required this.controller,
    required this.onOpenAccount,
  });

  final CrmWorkspaceController controller;
  final ValueChanged<String> onOpenAccount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: 'Pipeline',
          subtitle: 'Enkel salgsflate for deals knyttet til accounts.',
        ),
        const SizedBox(height: 16),
        Expanded(
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: DealStage.values.length,
            separatorBuilder: (context, index) => const SizedBox(width: 14),
            itemBuilder: (context, index) {
              final stage = DealStage.values[index];
              final deals = controller.deals
                  .where((deal) => deal.stage == stage)
                  .toList();
              return _PipelineColumn(
                stage: stage,
                deals: deals,
                controller: controller,
                onOpenAccount: onOpenAccount,
              );
            },
          ),
        ),
      ],
    );
  }
}

class _PipelineColumn extends StatelessWidget {
  const _PipelineColumn({
    required this.stage,
    required this.deals,
    required this.controller,
    required this.onOpenAccount,
  });

  final DealStage stage;
  final List<Deal> deals;
  final CrmWorkspaceController controller;
  final ValueChanged<String> onOpenAccount;

  @override
  Widget build(BuildContext context) {
    final total = deals.fold<int>(0, (sum, deal) => sum + deal.valueNok);
    return Container(
      width: 300,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE1E5E8)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            stage.label,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text('${deals.length} deals · ${_formatNok(total)}'),
          const SizedBox(height: 14),
          Expanded(
            child: ListView.separated(
              itemCount: deals.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final deal = deals[index];
                final account = controller.accountById(deal.accountId);
                return _DealCard(
                  deal: deal,
                  accountName: account?.name ?? 'Ukjent account',
                  onTap: () => onOpenAccount(deal.accountId),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  const _DealCard({
    required this.deal,
    required this.accountName,
    required this.onTap,
  });

  final Deal deal;
  final String accountName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                deal.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(accountName, maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: Text(_formatNok(deal.valueNok))),
                  Text(deal.owner),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActivitiesSection extends StatelessWidget {
  const _ActivitiesSection({
    required this.controller,
    required this.onOpenAccount,
  });

  final CrmWorkspaceController controller;
  final ValueChanged<String> onOpenAccount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PageHeader(
          title: 'Oppgaver',
          subtitle:
              'Neste handlinger på tvers av accounts, kontakter og deals.',
          trailing: FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.add_task),
            label: const Text('Ny oppgave'),
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: controller.activities.isEmpty
              ? const _EmptyPanel(
                  icon: Icons.task_alt_outlined,
                  title: 'Ingen oppgaver',
                  body: 'Neste handlinger vises her når accounts får aktiviteter.',
                )
              : ListView.separated(
                  itemCount: controller.activities.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final activity = controller.activities[index];
                    final account = controller.accountById(activity.accountId);
                    return Card(
                      child: ListTile(
                        onTap: () => onOpenAccount(activity.accountId),
                        leading: const Icon(Icons.radio_button_unchecked),
                        title: Text(activity.title),
                        subtitle: Text(
                          '${account?.name ?? 'Ukjent account'} · ${activity.type}',
                        ),
                        trailing: Text(activity.dueLabel),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _PageHeader extends StatelessWidget {
  const _PageHeader({
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 12), trailing!],
      ],
    );
  }
}

class _RoleWrap extends StatelessWidget {
  const _RoleWrap({required this.roles});

  final List<AccountRole> roles;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: roles.map((role) => Chip(label: Text(role.label))).toList(),
    );
  }
}

class _DetailGrid extends StatelessWidget {
  const _DetailGrid({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 700 ? 4 : 2;
        final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: children
              .map((child) => SizedBox(width: width, child: child))
              .toList(),
        );
      },
    );
  }
}

class _FactTile extends StatelessWidget {
  const _FactTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F7F8),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 4),
          Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          ?action,
        ],
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow(this.contact);

  final Contact contact;

  @override
  Widget build(BuildContext context) {
    return _LineItem(
      icon: Icons.person_outline,
      title: contact.name,
      subtitle: '${contact.title} · ${contact.email}',
      trailing: contact.isPrimary ? 'Primær' : null,
    );
  }
}

class _DealRow extends StatelessWidget {
  const _DealRow(this.deal);

  final Deal deal;

  @override
  Widget build(BuildContext context) {
    return _LineItem(
      icon: Icons.sell_outlined,
      title: deal.title,
      subtitle: '${deal.stage.label} · ${_formatNok(deal.valueNok)}',
      trailing: deal.owner,
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow(this.activity);

  final Activity activity;

  @override
  Widget build(BuildContext context) {
    return _LineItem(
      icon: Icons.task_alt_outlined,
      title: activity.title,
      subtitle: '${activity.type} · ${activity.dueLabel}',
    );
  }
}

class _LinkedSignalRow extends StatelessWidget {
  const _LinkedSignalRow(this.signal);

  final CrmSignal signal;

  @override
  Widget build(BuildContext context) {
    return _LineItem(
      icon: Icons.notifications_active_outlined,
      title: signal.title,
      subtitle: '${signal.observedLabel} · score ${signal.score}',
    );
  }
}

class _NoteRow extends StatelessWidget {
  const _NoteRow(this.note);

  final Note note;

  @override
  Widget build(BuildContext context) {
    return _LineItem(
      icon: Icons.notes_outlined,
      title: note.body,
      subtitle: '${note.author} · ${note.createdLabel}',
    );
  }
}

class _LineItem extends StatelessWidget {
  const _LineItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            Text(trailing!, style: Theme.of(context).textTheme.labelMedium),
          ],
        ],
      ),
    );
  }
}

class _ScoreBadge extends StatelessWidget {
  const _ScoreBadge({required this.score});

  final int score;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: 54,
      height: 54,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.primaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$score',
        style: TextStyle(
          color: colors.onPrimaryContainer,
          fontWeight: FontWeight.w900,
          fontSize: 18,
        ),
      ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}

class _LoadingWorkspace extends StatelessWidget {
  const _LoadingWorkspace();

  @override
  Widget build(BuildContext context) {
    return const Center(child: CircularProgressIndicator());
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE1E5E8)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 38, color: colors.primary),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

String _formatNok(int value) {
  final raw = value.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < raw.length; i += 1) {
    final remaining = raw.length - i;
    buffer.write(raw[i]);
    if (remaining > 1 && remaining % 3 == 1) {
      buffer.write(' ');
    }
  }
  return '$buffer kr';
}
