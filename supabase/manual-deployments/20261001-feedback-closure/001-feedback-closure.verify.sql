begin read only;
select md5(prosrc) as feedback_function_hash, md5(prosrc)='ed8b9f37de114b7eb8f2d7edab74385a' as patch_matches,prosecdef as security_definer,proconfig,proacl::text from pg_proc where oid='private.validate_feedback_write()'::regprocedure;
commit;
