# Megatanda de cierre de implementación · 25/11/2026

Base de trabajo: PR #126 sobre #115. Complemento del plan de 18 objetivos y 12 puntos; no sustituye su matriz de aceptación.

| Bloque | Implementación | Límite |
|---|---|---|
| Continuidad integral | asen_plan_resume_batch + /asen-worktrees integration-auto: candidato del diario, pruebas conjuntas, revisión, integración y sucesora. El padre recibe señal cuando llegan ambos recibos válidos. | Cada prueba de código, revisión e integración usa los diálogos existentes. No se ejecutan Writers sin permiso, no se toca main y se detiene ante bloqueos. |
| Recuperación | Checkpoint local firmado HMAC, ligado a sesión, proyecto, lote, árbol, commit, huella del plan y firma del recibo. Conserva revisión doble pendiente, aprobada o con hallazgos. | No restaura permisos ni convierte una revisión fallida en aprobación. La integración conserva consentimiento nuevo. |
| Sucesoras | Revalidación de raíces y candidato antes de lanzamiento, rechazo de checkout cambiado, comprobación de recibo nativo para éxito, recuperación de estado posterior al lanzamiento. Las selecciones exactas no se transforman en cola genérica. | El fallo real de la sucesora del run 45631298486 sigue sin causa exacta; no declarar que se ha reparado. |
| Métricas | /asen-flow-metrics: mensajes Pi del padre, tiempos y uso observado de hijos, jueces y resultados firmados. | Datos ausentes se muestran como desconocidos. Los costes informados por Pi no son una factura; no se pretende medir inferencias fallidas sin recibo ni duplicar la telemetría global. |
| Identidad de jueces | Equivalencia canónica restringida, rechazo de selección distinta, distinción entre descriptor declarado y respuesta de proveedor; recuperación conserva independencia declarada. | Si el proveedor no suministra responseModel, la identidad física no se acredita. |

No se han lanzado nuevos ensayos de modelos ni declarado éxito por CI. globalFull:false. Pendientes: revisión del nuevo SHA, pruebas y aceptación real del flujo de extremo a extremo, causa del fallo de la sucesora, datos de facturación e identidad del proveedor cuando existan. No ampliar paralelismo o eliminar contexto sin mediciones.

## Revisión posterior

- Corregir inventarios de comandos y herramientas Pi; registrar asen-flow-metrics y reservar asen_plan_resume_batch para impedir colisiones. La CI 45639738580 detectó cuatro fallos de inventario, propagados a los tres sistemas. No dar por validado el nuevo SHA hasta la CI.
- Conservar dictámenes dobles existentes. La recuperación solo acepta checkpoints firmados del mismo candidato. Serializar avance automático y comandos manuales con el bloqueo privado existente, sin reintento de inferencia ante contención. La doble revisión se puede solicitar desde el flujo natural sin comando manual, con consentimiento específico. No repetir una revisión doble pendiente automáticamente.
