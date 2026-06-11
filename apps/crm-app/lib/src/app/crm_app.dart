import 'package:flutter/material.dart';

import '../crm/application/crm_repositories.dart';
import '../crm/application/crm_use_cases.dart';
import '../crm/application/crm_workspace_controller.dart';
import '../crm/data/api_crm_store.dart';
import '../crm/data/fallback_crm_store.dart';
import '../crm/data/mock_crm_store.dart';
import '../crm/presentation/crm_workspace_page.dart';
import 'crm_theme.dart';

class CrmApp extends StatefulWidget {
  const CrmApp({this.dataSource, super.key});

  final CrmWorkspaceStore? dataSource;

  @override
  State<CrmApp> createState() => _CrmAppState();
}

class _CrmAppState extends State<CrmApp> {
  late final CrmWorkspaceStore _dataSource;
  late final CrmWorkspaceController _controller;

  @override
  void initState() {
    super.initState();
    _dataSource = widget.dataSource ?? _defaultDataSource();
    _controller = CrmWorkspaceController(
      store: _dataSource,
      createAccountFromSignalUseCase: CreateAccountFromSignalUseCase(
        _dataSource,
      ),
    );
    _controller.load();
  }

  @override
  void dispose() {
    _controller.dispose();
    _dataSource.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'crm_signal CRM',
      theme: buildCrmTheme(),
      home: CrmWorkspacePage(controller: _controller),
    );
  }

  CrmWorkspaceStore _defaultDataSource() {
    const baseUrl = String.fromEnvironment(
      'CRM_API_BASE_URL',
      defaultValue: 'http://127.0.0.1:5185',
    );
    const tenantSlug = String.fromEnvironment(
      'CRM_TENANT_SLUG',
      defaultValue: 'local-demo',
    );

    return FallbackCrmStore(
      primary: ApiCrmStore(
        client: CrmApiClient(
          baseUrl: Uri.parse(baseUrl),
          tenantSlug: tenantSlug,
        ),
      ),
      fallback: MockCrmStore(),
    );
  }
}
