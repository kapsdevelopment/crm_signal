import 'package:crm_app/src/app/crm_app.dart';
import 'package:crm_app/src/crm/data/mock_crm_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('creates an account from a signal', (tester) async {
    await tester.pumpWidget(CrmApp(dataSource: MockCrmStore()));
    await tester.pumpAndSettle();

    expect(find.text('Accounts'), findsWidgets);
    expect(find.text('Nordic Field Systems AS'), findsWidgets);

    await tester.tap(find.text('Signaler'));
    await tester.pumpAndSettle();

    expect(find.text('Signalfeed'), findsOneWidget);

    await tester.tap(
      find.widgetWithText(FilledButton, 'Opprett account').first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Accounts'), findsWidgets);
    expect(find.text('Oslo Cloud Drift AS'), findsWidgets);
    expect(find.text('Akkurat nå'), findsWidgets);
  });
}
